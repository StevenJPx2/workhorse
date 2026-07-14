import { getSandbox } from "@cloudflare/sandbox";
import type { Env, TicketParams, TicketRecord } from "./types";

export { Sandbox } from "@cloudflare/sandbox";
export { TicketWorkflow } from "./ticket-workflow";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${env.SPIKE_TOKEN}`) {
      return new Response("unauthorized", { status: 401 });
    }

    // Token push from the MacBook custodian (fresh short-lived access token).
    if (url.pathname === "/token" && request.method === "POST") {
      const { access, expires } = (await request.json()) as { access: string; expires: number };
      if (!access?.startsWith("sk-ant-oat")) return json({ error: "not an oauth access token" }, 400);
      await env.TICKETS.put("auth:access", JSON.stringify({ access, expires }));
      return json({ ok: true, expires });
    }

    // ---- Ticket API (the Workhorse fleet surface) ----

    // File a ticket: creates registry record + durable workflow instance.
    if (url.pathname === "/tickets" && request.method === "POST") {
      const body = (await request.json()) as Partial<TicketParams>;
      if (!body.repo || !body.prompt) {
        return json({ error: "repo, prompt required" }, 400);
      }
      if (!body.accessToken) {
        // Fall back to the custodian-pushed token.
        const stored = await env.TICKETS.get("auth:access");
        const parsed = stored ? (JSON.parse(stored) as { access: string; expires: number }) : null;
        if (!parsed || parsed.expires - Date.now() < 10 * 60 * 1000) {
          return json({ error: "no fresh access token available (custodian push stale?)" }, 503);
        }
        body.accessToken = parsed.access;
      }
      const id = crypto.randomUUID().slice(0, 8);
      const now = new Date().toISOString();
      const rec: TicketRecord = {
        id,
        title: body.title ?? body.prompt.slice(0, 60),
        repo: body.repo,
        prompt: body.prompt,
        status: "queued",
        createdAt: now,
        updatedAt: now,
      };
      await env.TICKETS.put(id, JSON.stringify(rec));
      await env.TICKET_WF.create({
        id,
        params: { ...body, id, title: rec.title } as TicketParams,
      });
      return json({ ok: true, ticket: rec });
    }

    // List tickets.
    if (url.pathname === "/tickets" && request.method === "GET") {
      const list = await env.TICKETS.list();
      const tickets: TicketRecord[] = [];
      for (const key of list.keys) {
        if (key.name.includes(":")) continue; // skip diff:<id> etc.
        const raw = await env.TICKETS.get(key.name);
        if (raw) tickets.push(JSON.parse(raw));
      }
      tickets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return json({ tickets });
    }

    // Ticket detail (registry + live workflow status).
    const detail = url.pathname.match(/^\/tickets\/([a-z0-9-]+)$/);
    if (detail && request.method === "GET") {
      const raw = await env.TICKETS.get(detail[1]);
      if (!raw) return json({ error: "not found" }, 404);
      let wfStatus: unknown = null;
      try {
        const inst = await env.TICKET_WF.get(detail[1]);
        wfStatus = await inst.status();
      } catch {
        /* instance may not exist yet */
      }
      return json({ ticket: JSON.parse(raw), workflow: wfStatus });
    }

    // Full diff (persisted at delivery; survives sandbox death).
    const diffM = url.pathname.match(/^\/tickets\/([a-z0-9-]+)\/diff$/);
    if (diffM && request.method === "GET") {
      const diff = await env.TICKETS.get(`diff:${diffM[1]}`);
      if (!diff) return json({ error: "no diff persisted" }, 404);
      return new Response(diff, { headers: { "content-type": "text/x-diff" } });
    }

    // ---- Phase-0 debug endpoints (kept for ops) ----

    if (url.pathname === "/env") {
      const sandbox = getSandbox(env.Sandbox, "phase0");
      const result = await sandbox.exec(
        "echo node=$(node --version 2>/dev/null); echo git=$(git --version 2>/dev/null); uname -a",
      );
      return json({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr });
    }

    if (url.pathname === "/exec" && request.method === "POST") {
      const { cmd, sandbox: sid } = (await request.json()) as { cmd: string; sandbox?: string };
      const sandbox = getSandbox(env.Sandbox, sid ?? "phase0");
      const result = await sandbox.exec(cmd, { timeout: 300_000 });
      return json({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr });
    }

    return new Response(
      "workhorse: POST /tickets {title,repo,prompt,accessToken} | GET /tickets | GET /tickets/:id || /env | POST /exec",
    );
  },
};
