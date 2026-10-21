import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import appSource from "app-source";

// Durable Object on local disk: proves the storage folder is usable inside the sandbox.
export class Counter extends DurableObject {
  fetch() {
    const sql = this.ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS hits (at INTEGER)");
    sql.exec("INSERT INTO hits VALUES (?)", Date.now());
    return Response.json({ hits: sql.exec("SELECT count(*) AS n FROM hits").one().n });
  }
}

// The file capability an app receives. It reaches only the root's disk directory.
export class Fs extends WorkerEntrypoint {
  async read(path) {
    const response = await this.env.ROOT.fetch(`http://root/${encodeURI(path)}`);
    return { status: response.status, text: await response.text() };
  }
}

async function attempt(label, run) {
  try {
    return Response.json({ label, outcome: "reached", detail: await run() });
  } catch (error) {
    return Response.json({ label, outcome: "blocked", detail: String(error) });
  }
}

const app = (env, ctx) =>
  env.LOADER.get("notes", () => ({
    compatibilityDate: "2026-10-01",
    mainModule: "app.js",
    modules: { "app.js": appSource },
    env: { FS: ctx.exports.Fs({ props: { app: "notes" } }) },
    globalOutbound: null,
  }));

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/health") return new Response("ok");
    if (path === "/counter") return env.COUNTER.get(env.COUNTER.idFromName("one")).fetch(request);
    if (path.startsWith("/fs/")) {
      const response = await env.ROOT.fetch(`http://root/${path.slice(4)}`, {
        method: request.method,
        body: request.method === "PUT" ? await request.arrayBuffer() : undefined,
      });
      return new Response(await response.arrayBuffer(), { status: response.status });
    }
    if (path === "/host-socket") {
      return attempt("host-socket", async () => (await env.HOST_SOCKET.fetch("http://host/")).status);
    }
    if (path === "/net") {
      return attempt("net", async () => (await fetch("https://example.com/")).status);
    }
    if (path === "/mcp/notes") return app(env, ctx).getEntrypoint().fetch(request);
    // Isolates the cost of one Dynamic Worker from the cost of the MCP SDK inside it.
    if (path.startsWith("/tiny/")) {
      const tiny = env.LOADER.get(path, () => ({
        compatibilityDate: "2026-10-01",
        mainModule: "app.js",
        modules: { "app.js": "export default { fetch() { return new Response('tiny'); } }" },
        globalOutbound: null,
      }));
      return tiny.getEntrypoint().fetch(request);
    }
    return new Response("not found", { status: 404 });
  },
};
