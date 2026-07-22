// The ticket API — the Workhorse fleet surface. Master-gated.

import type { TicketParams } from "@workhorse/api";
import { appendEvents, appendSteer, wakeTicket } from "../events";
import { fileTicket } from "../tickets";
import { getTicket, knownRepos, listTickets, listTraceIndex, patchTicket } from "../db";
import { healTicket } from "../heal";
import { json, type Route } from "../router";

export const ticketRoutes: Route[] = [
  {
    // File a ticket: registry record + durable workflow instance.
    method: "POST",
    path: "/tickets",
    auth: "master",
    async handler({ request, env, url }) {
      const body = (await request.json()) as Partial<TicketParams>;
      const r = await fileTicket(env, { ...body, selfOrigin: url.origin });
      if (!r.ok) return json({ error: r.error }, r.status);
      return json({ ok: true, ticket: r.ticket });
    },
  },
  {
    method: "GET",
    path: "/tickets",
    auth: "master",
    handler: async ({ env, url }) =>
      json({ tickets: await listTickets(env, url.searchParams.get("status") ?? undefined) }),
  },
  {
    // Repos the fleet has seen, most recent first (home-page chips).
    method: "GET",
    path: "/repos",
    auth: "master",
    handler: async ({ env }) => json({ repos: await knownRepos(env) }),
  },
  {
    // Ticket detail (registry + live workflow status + self-heal reconcile).
    method: "GET",
    path: /^\/tickets\/([a-z0-9-]+)$/,
    auth: "master",
    async handler({ env, match }) {
      let ticket = await getTicket(env, match[1]);
      if (!ticket) return json({ error: "not found" }, 404);
      let wfStatus: { status?: string } | null = null;
      try {
        const inst = await env.TICKET_WF.get(ticket.wfInstance || match[1]);
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
        const r = await patchTicket(env, match[1], {
          status: deadMap[wf],
          error: ticket.error || `workflow instance ${wf}`,
        });
        if (r) ticket = r.next;
      }
      const live = await env.TICKETS.get(`live:${match[1]}`);
      return json({ ticket, workflow: wfStatus, live: live ? JSON.parse(live) : null });
    },
  },
  {
    method: "POST",
    path: /^\/tickets\/([a-z0-9-]+)\/heal$/,
    auth: "master",
    async handler({ env, match }) {
      const result = await healTicket(env, match[1]);
      return json(result, result.ok ? 200 : 409);
    },
  },
  {
    // Stop a running ticket: terminate the durable workflow instance.
    method: "POST",
    path: /^\/tickets\/([a-z0-9-]+)\/stop$/,
    auth: "master",
    async handler({ env, match }) {
      const rec = await getTicket(env, match[1]);
      if (!rec) return json({ error: "not found" }, 404);
      try {
        const inst = await env.TICKET_WF.get(rec.wfInstance || match[1]);
        await inst.terminate();
      } catch (e) {
        return json({ error: `terminate failed: ${e instanceof Error ? e.message : e}` }, 500);
      }
      await patchTicket(env, match[1], { status: "terminated", error: "stopped by user" });
      return json({ ok: true });
    },
  },
  {
    // Mid-run steering: queued; the drive loop delivers it into the live
    // session (RPC steer) on its next burst.
    method: "POST",
    path: /^\/tickets\/([a-z0-9-]+)\/steer$/,
    auth: "master",
    async handler({ request, env, match }) {
      const rec = await getTicket(env, match[1]);
      if (!rec) return json({ error: "not found" }, 404);
      const active = ["queued", "planning", "implementing", "ready-for-review"];
      if (!active.includes(rec.status ?? "")) {
        return json(
          { error: `ticket is ${rec.status}; steering targets a live run (use PR feedback while in-review)` },
          409,
        );
      }
      const { message } = (await request.json().catch(() => ({}))) as { message?: string };
      if (!message?.trim()) return json({ error: "message required" }, 400);
      await appendSteer(env, match[1], message.trim().slice(0, 4000));
      return json({ ok: true, note: "steer queued; applied on the next drive burst (<1 min)" });
    },
  },
  {
    // Operator input for an awaiting-input park.
    method: "POST",
    path: /^\/tickets\/([a-z0-9-]+)\/input$/,
    auth: "master",
    async handler({ request, env, match }) {
      const rec = await getTicket(env, match[1]);
      if (!rec) return json({ error: "not found" }, 404);
      if (rec.status !== "awaiting-input" || !rec.runId) {
        return json({ error: "ticket is not awaiting input" }, 409);
      }
      const { answers } = (await request.json().catch(() => ({}))) as {
        answers?: Record<string, unknown>;
      };
      if (!answers) return json({ error: "answers required" }, 400);
      try {
        const { engineFor } = await import("../agent-run");
        const engine = await engineFor(env, `ticket-${match[1]}`, rec.workflow);
        const stage = await engine.injectInput(rec.runId, answers);
        try {
          const inst = await env.TICKET_WF.get(rec.wfInstance ?? match[1]);
          await inst.sendEvent({ type: "operator-input", payload: {} });
        } catch {
          /* instance not parked yet — next burst reads the state anyway */
        }
        return json({ ok: true, stage });
      } catch (e) {
        return json({ error: String(e instanceof Error ? e.message : e).slice(0, 500) }, 422);
      }
    },
  },
  {
    // Acceptance verdicts for report/artifact outcomes.
    method: "POST",
    path: /^\/tickets\/([a-z0-9-]+)\/(accept|request-changes)$/,
    auth: "master",
    async handler({ request, env, ctx, match }) {
      const rec = await getTicket(env, match[1]);
      if (!rec) return json({ error: "not found" }, 404);
      if (rec.status !== "awaiting-acceptance") {
        return json({ error: "ticket is not awaiting acceptance" }, 409);
      }
      const { comment } = (await request.json().catch(() => ({}))) as { comment?: string };
      const accept = match[2] === "accept";
      if (!accept && !comment?.trim()) {
        return json({ error: "comment required when requesting changes" }, 400);
      }
      await appendEvents(env, [
        {
          ticketId: match[1],
          kind: accept ? "accepted" : "changes-requested",
          summary: accept
            ? "Operator accepted the result"
            : `Operator requested changes: ${comment!.slice(0, 1500)}`,
          receivedAt: new Date().toISOString(),
        },
      ]);
      ctx.waitUntil(wakeTicket(env, match[1]));
      return json({ ok: true });
    },
  },
  {
    // Attach context to a live ticket: steer when running, event when parked.
    method: "POST",
    path: /^\/tickets\/([a-z0-9-]+)\/attach$/,
    auth: "master",
    async handler({ request, env, ctx, url, match }) {
      const rec = await getTicket(env, match[1]);
      if (!rec) return json({ error: "not found" }, 404);
      const { kind, ref } = (await request.json().catch(() => ({}))) as { kind?: string; ref?: string };
      if (!kind || !ref) return json({ error: "kind, ref required" }, 400);
      const { resolveAttachments } = await import("../tickets");
      const section = await resolveAttachments(env, url.origin, [{ kind, ref }]);
      if (!section) return json({ error: "attachment did not resolve" }, 422);
      const active = ["queued", "planning", "implementing", "ready-for-review"].includes(rec.status);
      if (active) {
        await appendSteer(env, match[1], `Additional context attached by the operator:\n\n${section}`);
      } else {
        await appendEvents(env, [
          {
            ticketId: match[1],
            kind: "context-attached",
            summary: `Operator attached ${kind}:${ref}`,
            detail: { section: section.slice(0, 4000) },
            receivedAt: new Date().toISOString(),
          },
        ]);
        ctx.waitUntil(wakeTicket(env, match[1]));
      }
      return json({ ok: true, delivered: active ? "steer" : "event" });
    },
  },
  {
    // Activity trail: persisted post-run; live-read while running.
    method: "GET",
    path: /^\/tickets\/([a-z0-9-]+)\/activity$/,
    auth: "master",
    async handler({ env, match }) {
      const stored = await env.TICKETS.get(`activity:${match[1]}`);
      if (stored) return new Response(stored, { headers: { "content-type": "application/json" } });
      const rec = await getTicket(env, match[1]);
      if (!rec) return json({ error: "not found" }, 404);
      if (!rec.runId) return json({ runId: null, tasks: [], note: "run not started yet" });
      const { collectActivity } = await import("../agent-run");
      const live = await collectActivity(env, `ticket-${match[1]}`, rec.runId);
      return new Response(live, { headers: { "content-type": "application/json" } });
    },
  },
  {
    // Live streaming output: structured transcript of the running stage.
    method: "GET",
    path: /^\/tickets\/([a-z0-9-]+)\/output$/,
    auth: "master",
    async handler({ env, match }) {
      const rec = await getTicket(env, match[1]);
      if (!rec?.runId) return json({ output: null, note: "no run yet" });
      try {
        const { sandboxDriver } = await import("../agent-run");
        const driver = sandboxDriver(env, `ticket-${match[1]}`);
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
    },
  },
  {
    // Notification bus queue (read receipts included) for the UI.
    method: "GET",
    path: /^\/tickets\/([a-z0-9-]+)\/notifications$/,
    auth: "master",
    async handler({ env, match }) {
      const { listNotifications } = await import("../notifications");
      return json({ notifications: await listNotifications(env, match[1]) });
    },
  },
  {
    // Queue operator input on the bus (urgent = also live-steer).
    method: "POST",
    path: /^\/tickets\/([a-z0-9-]+)\/notify$/,
    auth: "master",
    async handler({ request, env, match }) {
      const body = (await request.json().catch(() => ({}))) as {
        body?: string;
        kind?: string;
        urgent?: boolean;
        author?: string;
      };
      if (!body.body?.trim()) return json({ error: "body required" }, 400);
      const { notify } = await import("../notifications");
      const n = await notify(env, {
        ticketId: match[1],
        source: "ui",
        kind: body.kind,
        body: body.body.trim(),
        author: body.author,
        urgent: body.urgent,
      });
      return json({ ok: true, seq: n.seq });
    },
  },
  {
    method: "GET",
    path: /^\/tickets\/([a-z0-9-]+)\/traces$/,
    auth: "master",
    handler: async ({ env, match }) => json(await listTraceIndex(env, match[1])),
  },
  {
    // Trace bodies: R2 first; legacy KV fallback (pre-blob-plane archives).
    method: "GET",
    path: /^\/tickets\/([a-z0-9-]+)\/traces\/(workflow_[a-z0-9_]+|wfrun_[a-z0-9_]+)$/,
    auth: "master",
    async handler({ env, match }) {
      const blob = await env.BLOBS.get(`trace/${match[1]}/${match[2]}.json`);
      if (blob) return new Response(blob.body, { headers: { "content-type": "application/json" } });
      const trace = await env.TICKETS.get(`trace:${match[1]}:${match[2]}`);
      if (!trace) return json({ error: "no trace" }, 404);
      return new Response(trace, { headers: { "content-type": "application/json" } });
    },
  },
  {
    // Full diff (persisted at delivery; survives sandbox death).
    method: "GET",
    path: /^\/tickets\/([a-z0-9-]+)\/diff$/,
    auth: "master",
    async handler({ env, match }) {
      const diff = await env.TICKETS.get(`diff:${match[1]}`);
      if (!diff) return json({ error: "no diff persisted" }, 404);
      return new Response(diff, { headers: { "content-type": "text/x-diff" } });
    },
  },
];
