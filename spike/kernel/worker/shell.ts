// Spike shell: a Durable Object that performs the effects a core returns. The
// shell owns SQLite, the clock, alarms and sockets; the core owns every rule.
// Adapted from spike 3's worker/src/shell.ts, without the Dynamic Worker checks.
import { DurableObject } from "cloudflare:workers";
import type { Effect, Input, Reply } from "../ts/mailbox.ts";
import type { Core } from "../ts/rust-kernel.ts";

type Env = { MAILBOX: DurableObjectNamespace };

type Delivery = { seq: number; key: string; event: string };

type RpcRequest = { id: number; method: string; params: Record<string, unknown> };

type RpcResponse = { jsonrpc: "2.0"; id: number; result?: Reply; error?: { code: number; message: string } };

type Queued = { ws: WebSocket; id: number; input: Input };

/** Most requests in one batch frame or one coalesced flush (`MAX_BATCH` in kernel/src/wire.rs). */
const MAX_BATCH = 4096;

export type ShellOptions = {
  /**
   * Hold single-request frames and run them through the core together on a zero-delay
   * timer. Every client benefits, at the cost of a timer turn of latency per request.
   */
  coalesce: boolean;
};

const notFound = (id: number): RpcResponse => ({ jsonrpc: "2.0", id, error: { code: -32601, message: "method not found" } });

export function defineShell(openCore: () => Core, options: ShellOptions) {
  class Mailbox extends DurableObject<Env> {
    private readonly core = openCore();
    private queue: Queued[] = [];
    private flushScheduled = false;

    constructor(ctx: DurableObjectState, env: Env) {
      super(ctx, env);
      const sql = ctx.storage.sql;
      sql.exec(
        "CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, event TEXT NOT NULL, acked INTEGER NOT NULL DEFAULT 0)",
      );
      sql.exec("CREATE TABLE IF NOT EXISTS task (id INTEGER PRIMARY KEY CHECK (id = 1), interval_ms INTEGER NOT NULL)");
      const events = sql
        .exec("SELECT seq, key, event, acked FROM events ORDER BY seq")
        .toArray()
        .map((row) => ({ seq: Number(row.seq), key: String(row.key), event: String(row.event), acked: row.acked === 1 }));
      const task = sql.exec("SELECT interval_ms FROM task").toArray()[0];
      this.run({ type: "restore", events, every_ms: task ? Number(task.interval_ms) : null });
    }

    override async fetch(request: Request): Promise<Response> {
      if (request.headers.get("upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
      for (const previous of this.ctx.getWebSockets()) previous.close(4000, "replaced by a newer consumer");
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      this.run({ type: "connect" });
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
      const parsed = JSON.parse(String(message)) as RpcRequest | RpcRequest[];
      if (Array.isArray(parsed)) {
        ws.send(JSON.stringify(this.runFrame(parsed)));
        return;
      }
      const input = toInput(parsed.method, parsed.params);
      if (input === undefined) {
        ws.send(JSON.stringify(notFound(parsed.id)));
        return;
      }
      if (!options.coalesce) {
        const [result] = this.runBatch([input]);
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: parsed.id, result }));
        return;
      }
      this.queue.push({ ws, id: parsed.id, input });
      if (this.queue.length >= MAX_BATCH) this.flush();
      else if (!this.flushScheduled) {
        this.flushScheduled = true;
        setTimeout(() => this.flush(), 0);
      }
    }

    override async alarm(): Promise<void> {
      this.run({ type: "tick", now_ms: Date.now() });
    }

    /** A JSON-RPC batch frame: every known method in one core call, replies in request order. */
    private runFrame(requests: RpcRequest[]): RpcResponse[] {
      if (requests.length > MAX_BATCH) {
        return [{ jsonrpc: "2.0", id: 0, error: { code: -32600, message: `batch over ${MAX_BATCH} requests` } }];
      }
      const calls = requests.map((request) => ({ id: request.id, input: toInput(request.method, request.params) }));
      const inputs = calls.flatMap((call) => (call.input === undefined ? [] : [call.input]));
      const results = this.runBatch(inputs);
      let next = 0;
      return calls.map((call) => {
        if (call.input === undefined) return notFound(call.id);
        const result = results[next];
        next += 1;
        return { jsonrpc: "2.0", id: call.id, ...(result === undefined ? {} : { result }) };
      });
    }

    private flush(): void {
      this.flushScheduled = false;
      const queued = this.queue;
      this.queue = [];
      const results = this.runBatch(queued.map((each) => each.input));
      queued.forEach((each, i) => {
        if (each.ws.readyState === WebSocket.OPEN) each.ws.send(JSON.stringify({ jsonrpc: "2.0", id: each.id, result: results[i] }));
      });
    }

    private run(input: Input): Reply | undefined {
      return this.runBatch([input])[0];
    }

    /** One core call for all `inputs`, then each input's effects in order; returns each input's reply. */
    private runBatch(inputs: readonly Input[]): (Reply | undefined)[] {
      if (inputs.length === 0) return [];
      const outputs = inputs.length === 1 && inputs[0] !== undefined ? [this.core.handle(inputs[0])] : this.core.handleBatch(inputs);
      return outputs.map((effects) => {
        let result: Reply | undefined;
        for (const effect of effects) result = this.perform(effect) ?? result;
        return result;
      });
    }

    private perform(effect: Effect): Reply | undefined {
      const sql = this.ctx.storage.sql;
      switch (effect.type) {
        case "persist":
          sql.exec("INSERT INTO events (seq, key, event) VALUES (?, ?, ?)", effect.seq, effect.key, effect.event);
          return undefined;
        case "mark_acked":
          sql.exec("UPDATE events SET acked = 1 WHERE seq = ?", effect.seq);
          return undefined;
        case "deliver":
          this.deliver(effect);
          return undefined;
        case "save_task":
          sql.exec("INSERT OR REPLACE INTO task (id, interval_ms) VALUES (1, ?)", effect.interval_ms);
          return undefined;
        case "set_alarm":
          void this.ctx.storage.setAlarm(effect.at_ms);
          return undefined;
        case "reply":
          return effect.result;
      }
    }

    private deliver(effect: Delivery): void {
      const frame = JSON.stringify({
        jsonrpc: "2.0",
        method: "mailbox.deliver",
        params: { seq: effect.seq, key: effect.key, event: JSON.parse(effect.event) },
      });
      for (const ws of this.ctx.getWebSockets()) if (ws.readyState === WebSocket.OPEN) ws.send(frame);
    }
  }

  const worker = {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === "/health") return new Response("ok");
      if (url.pathname === "/bench") {
        const n = Number(url.searchParams.get("n") ?? 1000);
        const batch = Number(url.searchParams.get("batch") ?? 1);
        const core = openCore();
        const checksum = bench(core, n, batch);
        core.close();
        return Response.json({ n, batch, checksum });
      }
      const match = /^\/mailbox\/([\w:.-]+)$/.exec(url.pathname);
      if (match?.[1] === undefined) return new Response("not found", { status: 404 });
      return env.MAILBOX.get(env.MAILBOX.idFromName(match[1])).fetch(request);
    },
  };

  return { Mailbox, worker };
}

// CPU only: a fresh core, no SQLite, no sockets. n publish+ack cycles, then n/10
// duplicate publishes, `batch` inputs per core call. At batch 1 the sequence and
// checksum equal spike 3's bench, so results compare with its table.
function bench(core: Core, n: number, batch: number): number {
  let checksum = 0;
  for (let start = 0; start < n; start += batch) {
    const keys = range(start, Math.min(n, start + batch));
    const seqs = call(core, keys.map((i) => publish(`k${i}`))).map((reply) => {
      if (reply.status !== "published") throw new Error(`publish: ${reply.status}`);
      checksum += reply.seq;
      return reply.seq;
    });
    const acks = call(core, seqs.map((seq): Input => ({ type: "ack", seq })));
    checksum += acks.filter((reply) => reply.status === "acked").length;
  }
  for (let start = 0; start < n / 10; start += batch) {
    const keys = range(start, Math.min(n / 10, start + batch));
    checksum += call(core, keys.map((i) => publish(`k${i}`))).filter((reply) => reply.status === "duplicate").length;
  }
  return checksum;
}

const publish = (key: string): Input => ({ type: "publish", key, event: "{}" });

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from }, (_, i) => from + i);
}

function call(core: Core, inputs: Input[]): Reply[] {
  const [only] = inputs;
  const outputs = inputs.length === 1 && only !== undefined ? [core.handle(only)] : core.handleBatch(inputs);
  return outputs.map(lastReply);
}

function lastReply(effects: Effect[]): Reply {
  const last = effects.at(-1);
  if (last?.type !== "reply") throw new Error("core returned no reply");
  return last.result;
}

function toInput(method: string, params: Record<string, unknown>): Input | undefined {
  switch (method) {
    case "mailbox.publish":
      return { type: "publish", key: String(params.key), event: JSON.stringify(params.event ?? {}) };
    case "mailbox.ack":
      return { type: "ack", seq: Number(params.seq) };
    case "task.every":
      return { type: "every", interval_ms: Number(params.interval_ms), now_ms: Date.now() };
    default:
      return undefined;
  }
}
