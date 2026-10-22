// The daemon under test: either the throwaway one the runner's global setup starts, or one you
// installed, named by WORKHORSE_SOCKET. `exchangeRaw` also opens a raw socket.
// @effect-diagnostics processEnv:off
import { connect as netConnect } from "node:net";
import { type Json, PROTOCOL_VERSION, type Response } from "@workhorse/protocol";
import { Effect, Schema, type Scope } from "effect";
import { type Client, connect } from "../src/client.ts";

class DaemonUnreachable extends Schema.TaggedError<
  DaemonUnreachable,
  { readonly DaemonUnreachable: unique symbol }
>()("DaemonUnreachable", {
  socket: Schema.String,
  cause: Schema.String,
}) {}

class RequestFailed extends Schema.TaggedError<
  RequestFailed,
  { readonly RequestFailed: unique symbol }
>()("RequestFailed", {
  method: Schema.String,
  cause: Schema.String,
}) {}

const socket = process.env["WORKHORSE_SOCKET"] ?? "";

// One connection per test, closed when the test's scope ends.
export const daemon: Effect.Effect<Client, DaemonUnreachable, Scope.Scope> = Effect.acquireRelease(
  Effect.tryPromise({
    try: () => connect(socket),
    catch: (cause) => new DaemonUnreachable({ socket, cause: String(cause) }),
  }),
  (client) => Effect.sync(() => client.close()),
);

export function request(
  client: Client,
  method: string,
  params?: Json,
): Effect.Effect<Response, RequestFailed> {
  return Effect.tryPromise({
    try: () => client.request(method, params),
    catch: (cause) => new RequestFailed({ method, cause: String(cause) }),
  });
}

// A connection that has already agreed on the protocol version.
export const ready = Effect.gen(function* () {
  const client = yield* daemon;
  yield* request(client, "hello", { protocol: [PROTOCOL_VERSION] });

  return client;
});

export type RawExchange = { readonly lines: readonly string[]; readonly closed: boolean };

// Writes bytes the client would never send, and collects reply lines until `count` arrive or
// the daemon closes the connection. Bounded by a 5 s deadline.
export function exchangeRaw(
  payload: string,
  count: number,
): Effect.Effect<RawExchange, DaemonUnreachable> {
  const exchange = Effect.callback<RawExchange, DaemonUnreachable>((resume) => {
    const connection = netConnect({ path: socket });
    const lines: string[] = [];
    let buffered = "";
    let done = false;

    const finish = (closed: boolean) => {
      if (done) return;
      done = true;
      connection.destroy();
      resume(Effect.succeed({ lines, closed }));
    };

    connection.on("connect", () => connection.write(payload));
    connection.on("data", (chunk: Buffer) => {
      buffered += chunk.toString("utf8");
      const parts = buffered.split("\n");
      buffered = parts.pop() ?? "";
      lines.push(...parts);

      if (lines.length >= count) finish(false);
    });
    connection.on("close", () => finish(true));
    connection.on("error", (cause) => {
      done = true;
      resume(Effect.fail(new DaemonUnreachable({ socket, cause: String(cause) })));
    });

    return Effect.sync(() => connection.destroy());
  });

  return Effect.timeoutOrElse(exchange, {
    duration: "5 seconds",
    orElse: () => Effect.fail(new DaemonUnreachable({ socket, cause: "no reply within 5 s" })),
  });
}
