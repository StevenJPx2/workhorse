import { getSandbox } from "@cloudflare/sandbox";
import { type BrowserFetchRequest, browserFetch } from './browser';
import { appendEvents } from "./events";
import { pluginFor } from "./plugins";
import type { Env, TicketParams, TicketRecord } from "./types";

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
      const plugin = pluginFor(hookM[1]);
      if (!plugin) return json({ error: "unknown source" }, 404);
      const rawBody = await request.text();
      if (!(await plugin.verify(request, rawBody, env).catch(() => false))) {
        return new Response("bad signature", { status: 401 });
      }
      let payload: unknown;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return json({ error: "not json" }, 400);
      }
      const events = await plugin.parse(request.headers, payload, env);
      if (events.length > 0) {
        await appendEvents(env, events);
        // Wake with retries: a webhook can land in the small window between
        // the workflow's pre-park event check and waitForEvent registration,
        // where a single sendEvent is silently lost. Events are already in
        // KV, so retried wakes are harmless (spurious wakes re-park).
        const wake = async (ticketId: string) => {
          for (let attempt = 0; attempt < 4; attempt++) {
            try {
              const rec = await env.TICKETS.get(ticketId);
              const wfId = rec ? ((JSON.parse(rec) as { wfInstance?: string }).wfInstance ?? ticketId) : ticketId;
              const inst = await env.TICKET_WF.get(wfId);
              await inst.sendEvent({ type: "external-event", payload: {} });
            } catch {
              /* not parked / already finished */
            }
            await new Promise((r) => setTimeout(r, 15_000));
          }
        };
        ctx.waitUntil(Promise.all([...new Set(events.map((e) => e.ticketId))].map(wake)));
      }
      return json({ ok: true, events: events.length });
    }

    const auth = request.headers.get("authorization") ?? "";

    // Browser plane: tiered fetch (Browser Rendering → unblocker escalation).
    // Authed by a SCOPED token (or the master token), NOT solely the master
    // bearer: ticket sandboxes run untrusted repo code, so the value injected
    // there must not be the fleet master key. Placed above the master gate so
    // the scoped token is accepted.
    if (url.pathname === "/browser" && request.method === "POST") {
      const okAuth =
        auth === `Bearer ${env.SPIKE_TOKEN}` ||
        (!!env.BROWSER_TOKEN && auth === `Bearer ${env.BROWSER_TOKEN}`);
      if (!okAuth) return new Response("unauthorized", { status: 401 });
      const body = (await request.json().catch(() => ({}))) as BrowserFetchRequest;
      if (!body.url) return json({ error: "url required" }, 400);
      const result = await browserFetch(env, body);
      return json(result, result.ok ? 200 : 502);
    }

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
      // Accept bare "owner/name" slugs as well as full git URLs.
      if (/^[\w.-]+\/[\w.-]+$/.test(body.repo)) {
        body.repo = `https://github.com/${body.repo}.git`;
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
        wfInstance: id,
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

    // Fleet chat: a Pi session in a dedicated sandbox, armed with the
    // workhorse extension tools (file/list/status/diff) so it can act.
    if (url.pathname === "/chat" && request.method === "POST") {
      const { messages } = (await request.json()) as {
        messages: Array<{ role: string; content: string }>;
      };
      const stored = await env.TICKETS.get("auth:access");
      const auth = stored ? (JSON.parse(stored) as { access: string; expires: number }) : null;
      if (!auth || auth.expires - Date.now() < 10 * 60 * 1000) {
        return json({ error: "no fresh access token (custodian push stale?)" }, 503);
      }
      const sandbox = getSandbox(env.Sandbox, "fleet-chat", { sleepAfter: "2m" });
      await sandbox.writeFile(
        "/root/.pi/agent/auth.json",
        JSON.stringify({
          anthropic: { type: "oauth", access: auth.access, refresh: "", expires: auth.expires },
        }),
      );
      const history = messages
        .map((m) => `${m.role === "user" ? "User" : "You"}: ${m.content}`)
        .join("\n\n");
      const prompt = `You are the Workhorse fleet operator agent, chatting with the user from the fleet dashboard.
You have workhorse_* tools: list tickets, check a ticket's status/diff, and file new tickets (repo + prompt \u2192 autonomous staged run \u2192 GitHub PR).
When the user wants work done, file a ticket. When they ask about progress, use the status tools and report crisply.
Before proposing a fix for a recurring problem, check earlier tickets for prior solutions (workhorse_list_tickets + workhorse_ticket_status).
Be concise. This is a chat: reply with your message only.\n\nConversation so far:\n${history}\n\nReply to the last user message.`;
      await sandbox.writeFile("/workspace/.chat-prompt", prompt);
      const result = await sandbox.exec(
        `cd /workspace && WORKHORSE_URL=${JSON.stringify(url.origin)} WORKHORSE_TOKEN=${JSON.stringify(env.SPIKE_TOKEN)} timeout 180 pi -p -np "$(cat /workspace/.chat-prompt)" 2>&1 | tail -c 4000`,
        { timeout: 200_000 },
      );
      if (result.exitCode !== 0) {
        return json({ error: `chat agent failed: ${result.stdout.slice(-400)}` }, 500);
      }
      return json({ reply: result.stdout.trim() });
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
