import { getSandbox } from "@cloudflare/sandbox";
import type { Env, TicketParams, TicketRecord } from "@workhorse/api";
import { appendEvents, appendSteer, wakeTicket } from "./events";
import { fileTicket } from "./tickets";
import { runFleetChat } from "./chat";
import { coreFor, pluginFor, routeFor } from "./plugins";

export { Sandbox } from "@cloudflare/sandbox";
export { TicketWorkflow } from "./ticket-workflow";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

const MAX_HEALS = 3;

/**
 * Re-dispatch a dead ticket on a fresh workflow instance that resumes from
 * recorded progress (branch/PR on GitHub, events + memory in KV). Used by
 * the manual /heal endpoint and the cron sweep.
 */
export async function healTicket(
  env: Env,
  ticketId: string,
): Promise<{ ok: boolean; reason?: string; instance?: string }> {
  const raw = await env.TICKETS.get(ticketId);
  if (!raw) return { ok: false, reason: "not found" };
  const rec = JSON.parse(raw) as TicketRecord;
  if (rec.status !== "errored") return { ok: false, reason: `status is ${rec.status}, only errored tickets heal` };
  const attempts = rec.healAttempts ?? 0;
  if (attempts >= MAX_HEALS) return { ok: false, reason: `heal limit (${MAX_HEALS}) reached` };

  // Confirm the current instance really is dead (never double-drive a ticket).
  try {
    const inst = await env.TICKET_WF.get(rec.wfInstance || ticketId);
    const st = (await inst.status()) as { status?: string };
    if (st.status && !["errored", "terminated", "complete"].includes(st.status)) {
      return { ok: false, reason: `instance still ${st.status}` };
    }
  } catch {
    /* no instance — definitely dead */
  }

  const instance = `${ticketId}-h${attempts + 1}`;
  const params: TicketParams = {
    id: ticketId,
    title: rec.title,
    repo: rec.repo,
    prompt: rec.prompt,
    accessToken: "", // freshToken() pulls the custodian token from KV
    workflow: rec.workflow,
    resume: true,
  };
  await env.TICKET_WF.create({ id: instance, params });
  rec.wfInstance = instance;
  rec.healAttempts = attempts + 1;
  rec.status = "queued";
  rec.error = undefined;
  rec.updatedAt = new Date().toISOString();
  await env.TICKETS.put(ticketId, JSON.stringify(rec));
  return { ok: true, instance };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Webhooks authenticate via per-plugin signatures, not the bearer.
    const hookM = url.pathname.match(/^\/webhooks\/([a-z0-9-]+)$/);
    if (hookM && request.method === "POST") {
      const webhook = pluginFor(hookM[1])?.webhook;
      if (!webhook) return json({ error: "unknown source" }, 404);
      const rawBody = await request.text();
      if (!(await webhook.verify(request, rawBody, env).catch(() => false))) {
        return new Response("bad signature", { status: 401 });
      }
      let payload: unknown;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return json({ error: "not json" }, 400);
      }
      // Sources with a bespoke webhook contract (handshakes, sub-3s acks)
      // take over the whole request; they emit events via core themselves.
      if (webhook.handle) {
        return webhook.handle(request, payload, env, ctx, coreFor(env, url.origin));
      }
      const events = (await webhook.parse?.(request.headers, payload, env)) ?? [];
      if (events.length > 0) {
        await appendEvents(env, events);
        ctx.waitUntil(
          Promise.all([...new Set(events.map((e) => e.ticketId))].map((t) => wakeTicket(env, t))),
        );
      }
      return json({ ok: true, events: events.length });
    }

    const auth = request.headers.get("authorization") ?? "";
    const masterAuth = auth === `Bearer ${env.SPIKE_TOKEN}`;
    // Scoped tier: the token injected into ticket sandboxes (untrusted repo
    // code runs there — it must never hold the fleet master key).
    const scopedAuth = masterAuth || (!!env.BROWSER_TOKEN && auth === `Bearer ${env.BROWSER_TOKEN}`);

    // Plugin routes (declared auth tier per route).
    const pluginRoute = routeFor(request.method, url.pathname);
    if (pluginRoute) {
      const ok = pluginRoute.auth === "scoped" ? scopedAuth : masterAuth;
      if (!ok) return new Response("unauthorized", { status: 401 });
      return pluginRoute.handler(request, env, ctx, coreFor(env, url.origin));
    }

    if (!masterAuth) {
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
      const r = await fileTicket(env, body);
      if (!r.ok) return json({ error: r.error }, r.status);
      return json({ ok: true, ticket: r.ticket });
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
      const ticket = JSON.parse(raw) as Record<string, string>;
      let wfStatus: { status?: string } | null = null;
      try {
        const inst = await env.TICKET_WF.get(ticket.wfInstance || detail[1]);
        wfStatus = (await inst.status()) as { status?: string };
      } catch {
        /* instance may not exist yet */
      }
      // Self-heal: if the durable instance is dead but the registry still
      // claims an active status, reconcile so the UI never lies.
      const activeStatuses = ["queued", "planning", "implementing", "ready-for-review", "in-review"];
      const deadMap: Record<string, string> = { errored: "errored", terminated: "terminated" };
      const wf = wfStatus?.status ?? "";
      if (deadMap[wf] && activeStatuses.includes(ticket.status)) {
        ticket.status = deadMap[wf];
        ticket.error = ticket.error || `workflow instance ${wf}`;
        ticket.updatedAt = new Date().toISOString();
        await env.TICKETS.put(detail[1], JSON.stringify(ticket));
      }
      const live = await env.TICKETS.get(`live:${detail[1]}`);
      return json({ ticket, workflow: wfStatus, live: live ? JSON.parse(live) : null });
    }

    // Heal an errored ticket: re-dispatch a fresh workflow instance that
    // resumes from recorded progress. Manual trigger; the cron uses the
    // same helper.
    const healM = url.pathname.match(/^\/tickets\/([a-z0-9-]+)\/heal$/);
    if (healM && request.method === "POST") {
      const result = await healTicket(env, healM[1]);
      return json(result, result.ok ? 200 : 409);
    }

    // Stop a running ticket: terminate the durable workflow instance.
    const stopM = url.pathname.match(/^\/tickets\/([a-z0-9-]+)\/stop$/);
    if (stopM && request.method === "POST") {
      const raw = await env.TICKETS.get(stopM[1]);
      if (!raw) return json({ error: "not found" }, 404);
      const stopRec = JSON.parse(raw) as { wfInstance?: string };
      try {
        const inst = await env.TICKET_WF.get(stopRec.wfInstance || stopM[1]);
        await inst.terminate();
      } catch (e) {
        return json({ error: `terminate failed: ${e instanceof Error ? e.message : e}` }, 500);
      }
      const rec = JSON.parse(raw);
      rec.status = "terminated";
      rec.error = "stopped by user";
      rec.updatedAt = new Date().toISOString();
      await env.TICKETS.put(stopM[1], JSON.stringify(rec));
      return json({ ok: true });
    }

    // Mid-run steering: append an operator message for the ticket's live
    // run. The driving workflow picks it up on its next burst (~50s),
    // interrupts the current stage, and re-runs it with the steer appended
    // to its prompt. Parked (in-review) tickets should use PR feedback
    // instead — steers target the ACTIVE run.
    const steerM = url.pathname.match(/^\/tickets\/([a-z0-9-]+)\/steer$/);
    if (steerM && request.method === "POST") {
      const raw = await env.TICKETS.get(steerM[1]);
      if (!raw) return json({ error: "not found" }, 404);
      const rec = JSON.parse(raw) as { status?: string };
      const active = ["queued", "planning", "implementing", "ready-for-review"];
      if (!active.includes(rec.status ?? "")) {
        return json({ error: `ticket is ${rec.status}; steering targets a live run (use PR feedback while in-review)` }, 409);
      }
      const { message } = (await request.json().catch(() => ({}))) as { message?: string };
      if (!message?.trim()) return json({ error: "message required" }, 400);
      await appendSteer(env, steerM[1], message.trim().slice(0, 4000));
      return json({ ok: true, note: "steer queued; applied on the next drive burst (<1 min)" });
    }

    // Fleet chat: a Pi session in a dedicated sandbox, armed with the
    // workhorse extension tools (file/list/status/diff) so it can act.
    if (url.pathname === "/chat" && request.method === "POST") {
      const { messages } = (await request.json()) as {
        messages: Array<{ role: string; content: string }>;
      };
      const r = await runFleetChat(env, url.origin, messages);
      if (!r.ok) return json({ error: r.error }, r.status);
      return json({ reply: r.reply });
    }

    // Activity trail: persisted post-run; live-read from the sandbox while running.
    const actM = url.pathname.match(/^\/tickets\/([a-z0-9-]+)\/activity$/);
    if (actM && request.method === "GET") {
      const stored = await env.TICKETS.get(`activity:${actM[1]}`);
      if (stored) return new Response(stored, { headers: { "content-type": "application/json" } });
      const raw = await env.TICKETS.get(actM[1]);
      if (!raw) return json({ error: "not found" }, 404);
      const rec = JSON.parse(raw) as { runId?: string };
      if (!rec.runId) return json({ runId: null, tasks: [], note: "run not started yet" });
      const { collectActivity } = await import("./agent-run");
      const live = await collectActivity(env, `ticket-${actM[1]}`, rec.runId);
      return new Response(live, { headers: { "content-type": "application/json" } });
    }

    // Durable trace archive: every run ever executed for a ticket (immutable;
    // activity is the "latest" pointer, traces are the history for evals).
    const trIdxM = url.pathname.match(/^\/tickets\/([a-z0-9-]+)\/traces$/);
    if (trIdxM && request.method === "GET") {
      const idx = await env.TICKETS.get(`traces:${trIdxM[1]}`);
      return new Response(idx ?? "[]", { headers: { "content-type": "application/json" } });
    }
    const trM = url.pathname.match(/^\/tickets\/([a-z0-9-]+)\/traces\/(workflow_[a-z0-9_]+)$/);
    if (trM && request.method === "GET") {
      const trace = await env.TICKETS.get(`trace:${trM[1]}:${trM[2]}`);
      if (!trace) return json({ error: "no trace" }, 404);
      return new Response(trace, { headers: { "content-type": "application/json" } });
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
      const sandbox = getSandbox(env.Sandbox, "phase0", { sleepAfter: "2m" });
      const result = await sandbox.exec(
        "echo node=$(node --version 2>/dev/null); echo git=$(git --version 2>/dev/null); uname -a",
      );
      return json({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr });
    }

    if (url.pathname === "/exec" && request.method === "POST") {
      const { cmd, sandbox: sid } = (await request.json()) as { cmd: string; sandbox?: string };
      const sandbox = getSandbox(env.Sandbox, sid ?? "phase0", { sleepAfter: "2m" });
      const result = await sandbox.exec(cmd, { timeout: 300_000 });
      return json({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr });
    }

    return new Response(
      "workhorse: POST /tickets {title,repo,prompt,accessToken} | GET /tickets | GET /tickets/:id || /env | POST /exec",
    );
  },

  // Self-healing sweep: every 15 min, re-dispatch errored tickets that
  // still have heal budget. Skips anything a human already terminated.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const sweep = async () => {
      const list = await env.TICKETS.list();
      for (const key of list.keys) {
        if (key.name.includes(":")) continue;
        const raw = await env.TICKETS.get(key.name);
        if (!raw) continue;
        const rec = JSON.parse(raw) as TicketRecord;
        if (rec.status !== "errored") continue;
        // Give ops a quiet window: only heal tickets errored >5 min ago
        // (avoids racing a deploy or a human already investigating).
        if (Date.now() - new Date(rec.updatedAt).getTime() < 5 * 60 * 1000) continue;
        const res = await healTicket(env, rec.id);
        console.log(`heal sweep ${rec.id}: ${res.ok ? `re-dispatched as ${res.instance}` : res.reason}`);
      }
    };
    ctx.waitUntil(sweep());
  },
};
