// Self-healing: re-dispatch a dead ticket on a fresh workflow instance
// that resumes from recorded progress (branch/PR on GitHub, events +
// memory in KV). Used by POST /tickets/:id/heal and the cron sweep.

import type { Env, TicketParams } from "@workhorse/api";
import { getTicket, listTraceIndex, patchTicket } from "./db";

const MAX_HEALS = 3;

export async function healTicket(
  env: Env,
  ticketId: string,
): Promise<{ ok: boolean; reason?: string; instance?: string }> {
  const rec = await getTicket(env, ticketId);
  if (!rec) return { ok: false, reason: "not found" };
  if (rec.status !== "errored") return { ok: false, reason: `status is ${rec.status}, only errored tickets heal` };
  const attempts = rec.healAttempts ?? 0;
  if (attempts >= MAX_HEALS) return { ok: false, reason: `heal limit (${MAX_HEALS}) reached` };

  // Deterministic-failure guard: healing retries INFRASTRUCTURE deaths
  // (sandbox eviction, token expiry, worker deploys). A run that failed on
  // a control/schema violation will fail identically on every re-run —
  // re-dispatching it just burns tokens. Those need a steer or a fix, not
  // a heal.
  if (attempts >= 1 && /ended failed/.test(rec.error ?? "")) {
    const traces = await listTraceIndex(env, ticketId);
    const last = traces[0];
    if (last?.kind?.endsWith("-failed")) {
      return { ok: false, reason: "deterministic failure (failed run twice); needs operator action, not a heal" };
    }
  }

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
