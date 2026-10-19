// Spike shell: a Durable Object that performs the effects returned by a core.
// The shell owns SQLite, the clock, alarms, and sockets; the core owns every rule.
// Each entry file (entry-ts, entry-rust2, entry-rust1) supplies the core.
import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import type { Effect, Input, Reply } from "../../core-ts/mailbox.ts";

export type Core = { handle(input: Input): Effect[] };

type Env = {
  MAILBOX: DurableObjectNamespace;
  LOADER?: { get(name: string, load: () => unknown): { getEntrypoint(): Fetcher } };
};

export class Net extends WorkerEntrypoint<Env> {
  // The capability a sandboxed app receives instead of global fetch(): the
  // shell adds the credential, so the app never holds it.
  override async fetch(request: Request): Promise<Response> {
    const headers = new Headers(request.headers);
    headers.set("authorization", "Bearer daemon-held-secret");
    return fetch(new Request(request, { headers }));
  }
}

export function defineShell(newCore: () => Core) {
  class Mailbox extends DurableObject<Env> {
    private readonly core = newCore();

    constructor(ctx: DurableObjectState, env: Env) {
      super(ctx, env);
      const sql = ctx.storage.sql;
      sql.exec(
        "CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, event TEXT NOT NULL, acked INTEGER NOT NULL DEFAULT 0)",
      );
      sql.exec(
        "CREATE TABLE IF NOT EXISTS task (id INTEGER PRIMARY KEY CHECK (id = 1), interval_ms INTEGER NOT NULL)",
      );
      const events = sql
        .exec("SELECT seq, key, event, acked FROM events ORDER BY seq")
        .toArray()
        .map((row) => ({
          seq: Number(row.seq),
          key: String(row.key),
          event: String(row.event),
          acked: row.acked === 1,
        }));
      const task = sql.exec("SELECT interval_ms FROM task").toArray()[0];
      const restored = this.run({
        type: "restore",
        events,
        every_ms: task ? Number(task.interval_ms) : null,
      });
      console.log(`MAILBOX_RESTORED ${JSON.stringify(restored)}`);
    }

    override async fetch(request: Request): Promise<Response> {
      if (request.headers.get("upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      for (const previous of this.ctx.getWebSockets()) {
        previous.close(4000, "replaced by a newer consumer");
      }
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      this.run({ type: "connect" });
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
      const request = JSON.parse(String(message)) as {
        id: number;
        method: string;
        params: Record<string, unknown>;
      };
      const input = toInput(request.method, request.params);
      if (input === undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            error: { code: -32601, message: "method not found" },
          }),
        );
        return;
      }
      const result = this.run(input);
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
    }

    override async alarm(): Promise<void> {
      this.run({ type: "tick", now_ms: Date.now() });
    }

    private run(input: Input): Reply | undefined {
      const sql = this.ctx.storage.sql;
      let result: Reply | undefined;
      for (const effect of this.core.handle(input)) {
        switch (effect.type) {
          case "persist":
            sql.exec(
              "INSERT INTO events (seq, key, event) VALUES (?, ?, ?)",
              effect.seq,
              effect.key,
              effect.event,
            );
            break;
          case "mark_acked":
            sql.exec("UPDATE events SET acked = 1 WHERE seq = ?", effect.seq);
            break;
          case "deliver":
            this.deliver(effect);
            break;
          case "save_task":
            sql.exec(
              "INSERT OR REPLACE INTO task (id, interval_ms) VALUES (1, ?)",
              effect.interval_ms,
            );
            break;
          case "set_alarm":
            void this.ctx.storage.setAlarm(effect.at_ms);
            break;
          case "reply":
            result = effect.result;
            break;
        }
      }
      return result;
    }

    private deliver(effect: { seq: number; key: string; event: string }): void {
      const frame = JSON.stringify({
        jsonrpc: "2.0",
        method: "mailbox.deliver",
        params: { seq: effect.seq, key: effect.key, event: JSON.parse(effect.event) },
      });
      for (const ws of this.ctx.getWebSockets()) {
        if (ws.readyState === WebSocket.OPEN) ws.send(frame);
      }
    }
  }

  const worker = {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === "/health") return new Response("ok");
      if (url.pathname === "/bench") {
        const n = Number(url.searchParams.get("n") ?? 1000);
        return Response.json({ n, checksum: bench(newCore(), n) });
      }
      if (url.pathname === "/dynamic") {
        return dynamicWorkers(env, ctx, url.searchParams.get("echo") ?? "http://127.0.0.1:8790/");
      }
      const match = /^\/mailbox\/([\w:.-]+)$/.exec(url.pathname);
      if (match === null) return new Response("not found", { status: 404 });
      const stub = env.MAILBOX.get(env.MAILBOX.idFromName(match[1]!));
      return stub.fetch(request);
    },
  };

  return { Mailbox, worker };
}

// CPU-only: a fresh in-memory core, no SQLite, no sockets. N publish+ack
// cycles, then N/10 duplicate publishes. The checksum proves every variant
// computed the same replies.
function bench(core: Core, n: number): number {
  let checksum = 0;
  for (let i = 0; i < n; i += 1) {
    const published = reply(core.handle({ type: "publish", key: `k${i}`, event: "{}" }));
    if (published.status !== "published") throw new Error(`publish k${i}: ${published.status}`);
    checksum += published.seq;
    if (reply(core.handle({ type: "ack", seq: published.seq })).status === "acked") checksum += 1;
  }
  for (let i = 0; i < n / 10; i += 1) {
    if (reply(core.handle({ type: "publish", key: `k${i}`, event: "{}" })).status === "duplicate") {
      checksum += 1;
    }
  }
  return checksum;
}

function reply(effects: Effect[]): Reply {
  const last = effects.at(-1);
  if (last?.type !== "reply") throw new Error("core returned no reply");
  return last.result;
}

function toInput(method: string, params: Record<string, unknown>): Input | undefined {
  switch (method) {
    case "mailbox.publish":
      return {
        type: "publish",
        key: String(params.key),
        event: JSON.stringify(params.event ?? {}),
      };
    case "mailbox.ack":
      return { type: "ack", seq: Number(params.seq) };
    case "task.every":
      return { type: "every", interval_ms: Number(params.interval_ms), now_ms: Date.now() };
    default:
      return undefined;
  }
}

async function dynamicWorkers(env: Env, ctx: ExecutionContext, echoUrl: string): Promise<Response> {
  if (env.LOADER === undefined) return Response.json({ loader: "unavailable" });
  const exports = (
    ctx as unknown as { exports: Record<string, (options: { props: unknown }) => unknown> }
  ).exports;
  const direct = env.LOADER.get("direct", () => ({
    compatibilityDate: "2026-10-01",
    mainModule: "app.js",
    modules: {
      "app.js": `export default { async fetch() {
        try { await fetch(${JSON.stringify(echoUrl)}); return new Response("reached the network"); }
        catch (error) { return new Response("blocked: " + error.message); }
      } }`,
    },
    globalOutbound: null,
  }));
  const viaCapability = env.LOADER.get("via-capability", () => ({
    compatibilityDate: "2026-10-01",
    mainModule: "app.js",
    modules: {
      "app.js": `export default { async fetch(request, env) {
        const response = await env.NET.fetch(${JSON.stringify(echoUrl)});
        return Response.json({ envKeys: Object.keys(env), echoed: await response.json() });
      } }`,
    },
    env: { NET: exports.Net!({ props: { app: "via-capability" } }) },
    globalOutbound: null,
  }));
  const directText = await (await direct.getEntrypoint().fetch("http://app/")).text();
  const capability = await (await viaCapability.getEntrypoint().fetch("http://app/")).json();
  return Response.json({ direct: directText, viaCapability: capability });
}
