// A minimal client for a running daemon: one Unix socket connection, any number of requests in
// flight, each with a deadline. It returns the daemon's JSON-RPC response as sent, so tests and
// hand-run scripts see exactly what crossed the wire.
//
// This file is the Promise-facing adapter over node:net that callers `await` directly, so it
// constructs Promises and uses timers itself. Only those two rules are off, for this file.
// @effect-diagnostics newPromise:off
// @effect-diagnostics globalTimers:off
import { connect as netConnect, type Socket } from "node:net";
import {
  encodeLine,
  type Json,
  LineReader,
  MAX_LINE_BYTES,
  type Request,
  type RequestId,
  Response,
} from "@workhorse/protocol";
import { Option, Schema } from "effect";

const DEFAULT_DEADLINE_MS = 5000;

export interface Client extends AsyncDisposable {
  request(method: string, params?: Json): Promise<Response>;
  close(): void;
}

type Pending = {
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

const decodeResponse = Schema.decodeUnknownOption(Schema.fromJsonString(Response));

export function connect(socketPath: string, deadlineMs = DEFAULT_DEADLINE_MS): Promise<Client> {
  const socket = netConnect({ path: socketPath });

  return new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.once("connect", () => {
      socket.off("error", reject);
      resolve(new SocketClient(socket, deadlineMs));
    });
  });
}

class SocketClient implements Client {
  readonly #socket: Socket;
  readonly #deadlineMs: number;
  readonly #pending = new Map<RequestId, Pending>();
  readonly #reader = new LineReader(MAX_LINE_BYTES);
  #nextId = 1;
  // Set once; every later request fails with it.
  #closed: Error | undefined;

  constructor(socket: Socket, deadlineMs: number) {
    this.#socket = socket;
    this.#deadlineMs = deadlineMs;
    socket.on("data", (chunk: Buffer) => this.#receive(chunk));
    socket.on("error", (error) => this.#fail(error));
    socket.on("close", () => this.#fail(new Error("connection closed by the daemon")));
  }

  request(method: string, params?: Json): Promise<Response> {
    if (this.#closed !== undefined) return Promise.reject(this.#closed);
    const id = this.#nextId++;

    const message: Request =
      params === undefined
        ? { jsonrpc: "2.0", id, method }
        : { jsonrpc: "2.0", id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`no reply to ${method} (id ${id}) within ${this.#deadlineMs} ms`));
      }, this.#deadlineMs);

      this.#pending.set(id, { resolve, reject, timer });
      this.#socket.write(encodeLine(message));
    });
  }

  close(): void {
    this.#fail(new Error("client closed"));
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.close();

    return Promise.resolve();
  }

  #receive(chunk: Buffer): void {
    const { frames, overflow } = this.#reader.push(chunk);

    for (const frame of frames) {
      const response =
        frame.type === "line" ? Option.getOrUndefined(decodeResponse(frame.text)) : undefined;

      if (response === undefined) {
        this.#fail(new Error("the daemon sent a line that is not a JSON-RPC response"));

        return;
      }

      this.#settle(response);
    }

    if (overflow) this.#fail(new Error(`the daemon sent a line over ${MAX_LINE_BYTES} bytes`));
  }

  #settle(response: Response): void {
    const { id } = response;
    const pending = id === null ? undefined : this.#pending.get(id);

    if (id === null || pending === undefined) {
      this.#fail(
        new Error(`the daemon sent a response for no pending request: ${JSON.stringify(response)}`),
      );

      return;
    }

    clearTimeout(pending.timer);
    this.#pending.delete(id);
    pending.resolve(response);
  }

  #fail(error: Error): void {
    this.#closed ??= error;

    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(this.#closed);
    }

    this.#pending.clear();
    this.#socket.destroy();
  }
}
