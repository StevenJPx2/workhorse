import { getSandbox } from "@cloudflare/sandbox";
import type { Env, TicketParams, TicketRecord } from "@workhorse/api";
import { appendEvents, appendSteer, wakeTicket } from "./events";
import { fileTicket } from "./tickets";
import { runFleetChat } from "./chat";
import { coreFor, pluginFor, routeFor } from "./plugins";
import { getTicket, knownRepos, listTickets, listTraceIndex, patchTicket, backfillFromKV } from "./db";
import { NAME_RE, deleteWorkflow, getWorkflow, listWorkflows, putWorkflow, seedWorkflows } from "./workflows";

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
  const rec = await getTicket(env, ticketId);
  if (!rec) return { ok: false, reason: "not found" };
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
  await patchTicket(env, ticketId, {
    wfInstance: instance,
    healAttempts: attempts + 1,
    status: "queued",
    error: undefined,
  });
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

    // Semantic find (scoped): sandbox tools query the semindex corpora.
    if (url.pathname === "/find" && request.method === "GET") {
      if (!scopedAuth) return new Response("unauthorized", { status: 401 });
      const corpus = url.searchParams.get("corpus") ?? "";
      const q = url.searchParams.get("q") ?? "";
      if (!q.trim()) return json({ error: "q required" }, 400);
      const { scriptIndex, workflowIndex, toolIndex } = await import("./semindex");
      const index = { scripts: scriptIndex, workflows: workflowIndex, tools: toolIndex }[corpus];
      if (!index) return json({ error: "corpus must be scripts|workflows|tools" }, 400);
      const topK = Math.min(Number(url.searchParams.get("topK") ?? 5) || 5, 20);
      return json({ hits: await index.query(env, q, { topK }) });
    }

    // Dependency cache (R2): sandbox-side curl with the scoped token.
    // GET = restore (streamed), PUT = save (streamed to R2). Keys are
    // content-addressed (repo + lockfile hash) so entries are immutable.
    if (url.pathname === "/depcache") {
      if (!scopedAuth) return new Response("unauthorized", { status: 401 });
      const repo = url.searchParams.get("repo") ?? "";
      const hash = url.searchParams.get("hash") ?? "";
      if (!/^[\w./-]+$/.test(repo) || repo.includes("..") || !/^[a-f0-9]{64}$/.test(hash)) {
        return json({ error: "bad repo/hash" }, 400);
      }
      const key = `depcache/${repo}/${hash}.tar.gz`;
      if (request.method === "GET") {
        const obj = await env.BLOBS.get(key);
        if (!obj) return json({ error: "miss" }, 404);
        return new Response(obj.body, {
          headers: { "content-type": "application/gzip" },
        });
      }
      if (request.method === "PUT") {
        if (!request.body) return json({ error: "body required" }, 400);
        await env.BLOBS.put(key, request.body);
        return json({ ok: true });
      }
    }

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

    // One-time D1 backfill from legacy KV records (idempotent).
    if (url.pathname === "/admin/backfill-d1" && request.method === "POST") {
      return json(await backfillFromKV(env));
    }

    // Rebuild the semindex corpora (scripts/workflows/tools). Idempotent.
    if (url.pathname === "/admin/reindex-semindex" && request.method === "POST") {
      const { reindexAll } = await import("./semindex");
      return json(await reindexAll(env));
    }

    // ---- Agent block registry (reusable agent definitions) ----
    if (url.pathname === "/agents" && request.method === "GET") {
      const { listAgentBlocks } = await import("./agents");
      return json({ agents: await listAgentBlocks(env) });
    }
    if (url.pathname === "/agents/seed" && request.method === "POST") {
      const { seedAgentBlocks } = await import("./agents");
      return json({ seeded: await seedAgentBlocks(env) });
    }
    const agentM = url.pathname.match(/^\/agents\/([\w-]+)$/);
    if (agentM) {
      const { getAgentBlock, putAgentBlock, deleteAgentBlock } = await import("./agents");
      if (request.method === "GET") {
        const block = await getAgentBlock(env, agentM[1]);
        return block ? json({ agent: block }) : json({ error: "not found" }, 404);
      }
      if (request.method === "PUT") {
        const body = (await request.json().catch(() => null)) as {
          description?: string;
          tools?: string[];
          persona?: string;
        } | null;
        if (!body) return json({ error: "json body required" }, 400);
        const err = await putAgentBlock(env, {
          name: agentM[1],
          description: body.description ?? "",
          tools: body.tools ?? [],
          persona: body.persona ?? "",
          source: "user",
        });
        return err ? json({ error: err }, 422) : json({ ok: true });
      }
      if (request.method === "DELETE") {
        await deleteAgentBlock(env, agentM[1]);
        return json({ ok: true });
      }
    }

    // ---- Workflow registry (workflows are user data, not core code) ----

    if (url.pathname === "/workflows" && request.method === "GET") {
      return json({ workflows: await listWorkflows(env) });
    }
    if (url.pathname === "/workflows/seed" && request.method === "POST") {
      return json(await seedWorkflows(env));
    }
    const wfM = url.pathname.match(/^\/workflows\/([\w-]+)$/);
    if (wfM && NAME_RE.test(wfM[1])) {
      if (request.method === "GET") {
        const entry = await getWorkflow(env, wfM[1]);
        return entry ? json(entry) : json({ error: "not found" }, 404);
      }
      if (request.method === "PUT") {
        const body = (await request.json().catch(() => null)) as {
          spec?: Record<string, unknown>;
          agents?: Record<string, string>;
          schemas?: Record<string, string>;
        } | null;
        if (!body?.spec) return json({ error: "spec required" }, 400);
        const err = await putWorkflow(env, wfM[1], {
          spec: body.spec,
          agents: body.agents,
          schemas: body.schemas,
        });
        if (err) return json({ error: err }, 422);
        return json({ ok: true, name: wfM[1] });
      }
      if (request.method === "DELETE") {
        const entry = await getWorkflow(env, wfM[1]);
        if (!entry) return json({ error: "not found" }, 404);
        await deleteWorkflow(env, wfM[1]);
        return json({ ok: true });
      }
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

    // List tickets (optionally ?status=).
    if (url.pathname === "/tickets" && request.method === "GET") {
      const tickets = await listTickets(env, url.searchParams.get("status") ?? undefined);
      return json({ tickets });
    }

    // Repos the fleet has seen, most recent first (home-page chips).
    if (url.pathname === "/repos" && request.method === "GET") {
      return json({ repos: await knownRepos(env) });
    }

    // Ticket detail (registry + live workflow status).
    const detail = url.pathname.match(/^\/tickets\/([a-z0-9-]+)$/);
    if (detail && request.method === "GET") {
      let ticket = await getTicket(env, detail[1]);
      if (!ticket) return json({ error: "not found" }, 404);
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
      const deadMap = { errored: "errored", terminated: "terminated" } as const;
      const wf = (wfStatus?.status ?? "") as keyof typeof deadMap;
      if (deadMap[wf] && activeStatuses.includes(ticket.status)) {
        const r = await patchTicket(env, detail[1], {
          status: deadMap[wf],
          error: ticket.error || `workflow instance ${wf}`,
        });
        if (r) ticket = r.next;
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
      const stopRec = await getTicket(env, stopM[1]);
      if (!stopRec) return json({ error: "not found" }, 404);
      try {
        const inst = await env.TICKET_WF.get(stopRec.wfInstance || stopM[1]);
        await inst.terminate();
      } catch (e) {
        return json({ error: `terminate failed: ${e instanceof Error ? e.message : e}` }, 500);
      }
      await patchTicket(env, stopM[1], { status: "terminated", error: "stopped by user" });
      return json({ ok: true });
    }

    // Mid-run steering: append an operator message for the ticket's live
    // run. The driving workflow picks it up on its next burst (~50s),
    // interrupts the current stage, and re-runs it with the steer appended
    // to its prompt. Parked (in-review) tickets should use PR feedback
    // instead — steers target the ACTIVE run.
    // Attachment surface: match a pasted ref against plugin providers.
    if (url.pathname === "/attachments/match" && request.method === "POST") {
      const { input } = (await request.json().catch(() => ({}))) as { input?: string };
      if (!input?.trim()) return json({ match: null });
      const { attachmentProviders } = await import("./plugins");
      for (const [kind, p] of attachmentProviders()) {
        const ref = p.match(input.trim());
        if (ref) return json({ match: { kind, ref, label: p.label, icon: p.icon } });
      }
      return json({ match: null });
    }

    // Attach context to a LIVE ticket: resolve + deliver via the two-path
    // model (steer when running, queued event when parked).
    const attachM = url.pathname.match(/^\/tickets\/([a-z0-9-]+)\/attach$/);
    if (attachM && request.method === "POST") {
      const rec = await getTicket(env, attachM[1]);
      if (!rec) return json({ error: "not found" }, 404);
      const { kind, ref } = (await request.json().catch(() => ({}))) as { kind?: string; ref?: string };
      if (!kind || !ref) return json({ error: "kind, ref required" }, 400);
      const { resolveAttachments } = await import("./tickets");
      const section = await resolveAttachments(env, url.origin, [{ kind, ref }]);
      if (!section) return json({ error: "attachment did not resolve" }, 422);
      const active = ["queued", "planning", "implementing", "ready-for-review"].includes(rec.status);
      if (active) {
        await appendSteer(env, attachM[1], `Additional context attached by the operator:\n\n${section}`);
      } else {
        await appendEvents(env, [
          {
            ticketId: attachM[1],
            kind: "context-attached",
            summary: `Operator attached ${kind}:${ref}`,
            detail: { section: section.slice(0, 4000) },
            receivedAt: new Date().toISOString(),
          },
        ]);
        ctx.waitUntil(wakeTicket(env, attachM[1]));
      }
      return json({ ok: true, delivered: active ? "steer" : "event" });
    }

    // Operator input for an awaiting-input park: inject answers into the
    // engine, then wake the spine's waitForEvent.
    const inputM = url.pathname.match(/^\/tickets\/([a-z0-9-]+)\/input$/);
    if (inputM && request.method === "POST") {
      const rec = await getTicket(env, inputM[1]);
      if (!rec) return json({ error: "not found" }, 404);
      if (rec.status !== "awaiting-input" || !rec.runId) {
        return json({ error: "ticket is not awaiting input" }, 409);
      }
      const { answers } = (await request.json().catch(() => ({}))) as {
        answers?: Record<string, unknown>;
      };
      if (!answers) return json({ error: "answers required" }, 400);
      try {
        const { engineFor } = await import("./agent-run");
        const engine = await engineFor(env, `ticket-${inputM[1]}`, rec.workflow);
        const stage = await engine.injectInput(rec.runId, answers);
        try {
          const inst = await env.TICKET_WF.get(rec.wfInstance ?? inputM[1]);
          await inst.sendEvent({ type: "operator-input", payload: {} });
        } catch {
          /* instance not parked yet — next burst reads the state anyway */
        }
        return json({ ok: true, stage });
      } catch (e) {
        return json({ error: String(e instanceof Error ? e.message : e).slice(0, 500) }, 422);
      }
    }

    // Acceptance verdicts for report/artifact outcomes. Operator-only
    // (master bearer): accept completes, request-changes revises.
    const acceptM = url.pathname.match(/^\/tickets\/([a-z0-9-]+)\/(accept|request-changes)$/);
    if (acceptM && request.method === "POST") {
      const rec = await getTicket(env, acceptM[1]);
      if (!rec) return json({ error: "not found" }, 404);
      if (rec.status !== "awaiting-acceptance") {
        return json({ error: "ticket is not awaiting acceptance" }, 409);
      }
      const { comment } = (await request.json().catch(() => ({}))) as { comment?: string };
      const accept = acceptM[2] === "accept";
      if (!accept && !comment?.trim()) {
        return json({ error: "comment required when requesting changes" }, 400);
      }
      await appendEvents(env, [
        {
          ticketId: acceptM[1],
          kind: accept ? "accepted" : "changes-requested",
          summary: accept ? "Operator accepted the result" : `Operator requested changes: ${comment!.slice(0, 1500)}`,
          receivedAt: new Date().toISOString(),
        },
      ]);
      ctx.waitUntil(wakeTicket(env, acceptM[1]));
      return json({ ok: true });
    }

    const steerM = url.pathname.match(/^\/tickets\/([a-z0-9-]+)\/steer$/);
    if (steerM && request.method === "POST") {
      const rec = await getTicket(env, steerM[1]);
      if (!rec) return json({ error: "not found" }, 404);
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
      const rec = await getTicket(env, actM[1]);
      if (!rec) return json({ error: "not found" }, 404);
      if (!rec.runId) return json({ runId: null, tasks: [], note: "run not started yet" });
      const { collectActivity } = await import("./agent-run");
      const live = await collectActivity(env, `ticket-${actM[1]}`, rec.runId);
      return new Response(live, { headers: { "content-type": "application/json" } });
    }

    // Durable trace archive: every run ever executed for a ticket (immutable;
    // activity is the "latest" pointer, traces are the history for evals).
    // Live streaming output: tail of the running stage's session log.
    const outM = url.pathname.match(/^\/tickets\/([a-z0-9-]+)\/output$/);
    if (outM && request.method === "GET") {
      const rec = await getTicket(env, outM[1]);
      if (!rec?.runId) return json({ output: null, note: "no run yet" });
      try {
        const { sandboxDriver } = await import("./agent-run");
        const driver = sandboxDriver(env, `ticket-${outM[1]}`);
        const raw = await driver.readFile(`/workspace/.workflow/${rec.runId}/state.json`);
        if (!raw) return json({ output: null, note: "no live run state (sandbox cold)" });
        const state = JSON.parse(raw) as {
          stages: Array<{ id: string; status: string; rounds: number }>;
        };
        const active =
          state.stages.find((s) => s.status === "running") ??
          [...state.stages].reverse().find((s) => s.status !== "pending");
        if (!active) return json({ output: null, note: "no active stage" });
        const round = Math.max(1, active.rounds + (active.status === "running" ? 1 : 0));
        const dir = `/workspace/.workflow/${rec.runId}/stages/${active.id}/round-${round}`;
        // Structured transcript from the RPC event stream (turns, tool
        // calls, retries); stderr log as the fallback.
        const { tailEvents, renderEvents } = await import("@workhorse/workflow");
        const { events } = await tailEvents(driver, dir, 0);
        let output = events.length ? renderEvents(events).slice(-12000) : null;
        if (!output) {
          const r = await driver.exec(`tail -c 12000 ${dir}/session.log 2>/dev/null || true`, {
            timeout: 15_000,
          });
          output = r.stdout || null;
        }
        return json({ stage: active.id, status: active.status, output });
      } catch (e) {
        return json({ output: null, note: `unavailable: ${String(e).slice(0, 200)}` });
      }
    }

    const trIdxM = url.pathname.match(/^\/tickets\/([a-z0-9-]+)\/traces$/);
    if (trIdxM && request.method === "GET") {
      return json(await listTraceIndex(env, trIdxM[1]));
    }
    const trM = url.pathname.match(/^\/tickets\/([a-z0-9-]+)\/traces\/(workflow_[a-z0-9_]+)$/);
    if (trM && request.method === "GET") {
      // R2 first; legacy KV fallback for traces archived before the blob plane.
      const blob = await env.BLOBS.get(`trace/${trM[1]}/${trM[2]}.json`);
      if (blob) return new Response(blob.body, { headers: { "content-type": "application/json" } });
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
      // One query instead of a full KV scan: errored tickets outside the
      // 5-min quiet window (avoids racing a deploy or a human investigating).
      const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const errored = await listTickets(env, "errored");
      for (const rec of errored) {
        if (rec.updatedAt >= cutoff) continue;
        const res = await healTicket(env, rec.id);
        console.log(`heal sweep ${rec.id}: ${res.ok ? `re-dispatched as ${res.instance}` : res.reason}`);
      }
    };
    ctx.waitUntil(sweep());
  },
};
