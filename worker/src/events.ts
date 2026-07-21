// Ticket event store (KV): append-only list + consumed cursor. The webhook
// route appends and best-effort wakes the parked workflow; the workflow's
// revision loop reads everything past the cursor.

import type { ExternalEvent } from "@workhorse/api";
import type { Env } from "@workhorse/api";

export async function appendEvents(env: Env, events: ExternalEvent[]): Promise<void> {
  const byTicket = new Map<string, ExternalEvent[]>();
  for (const e of events) {
    byTicket.set(e.ticketId, [...(byTicket.get(e.ticketId) ?? []), e]);
  }
  for (const [ticketId, list] of byTicket) {
    const key = `events:${ticketId}`;
    const existing = JSON.parse((await env.TICKETS.get(key)) ?? "[]") as ExternalEvent[];
    existing.push(...list);
    await env.TICKETS.put(key, JSON.stringify(existing.slice(-200)));
  }
}

export async function unconsumedEvents(env: Env, ticketId: string): Promise<ExternalEvent[]> {
  const all = JSON.parse((await env.TICKETS.get(`events:${ticketId}`)) ?? "[]") as ExternalEvent[];
  const cursor = Number((await env.TICKETS.get(`events-cursor:${ticketId}`)) ?? "0");
  return all.slice(cursor);
}

/**
 * Wake a parked ticket workflow with retries: an event can land in the
 * small window between the workflow's pre-park event check and its
 * waitForEvent registration, where a single sendEvent is silently lost.
 * Events are already in KV, so retried wakes are harmless (spurious wakes
 * re-park). Run inside ctx.waitUntil.
 */
export async function wakeTicket(env: Env, ticketId: string, attempts = 4): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt++) {
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
}

export async function consumeEvents(env: Env, ticketId: string): Promise<void> {
  const all = JSON.parse((await env.TICKETS.get(`events:${ticketId}`)) ?? "[]") as ExternalEvent[];
  await env.TICKETS.put(`events-cursor:${ticketId}`, String(all.length));
}

// --- mid-run steering (operator → running stage) -------------------------
// Steers are NOT ExternalEvents: they target the live pi-workflow run (the
// current stage is restarted with the steer appended to its prompt), not
// the park ↔ revise loop. Same append-only + cursor pattern.

export async function appendSteer(env: Env, ticketId: string, message: string): Promise<void> {
  const key = `steers:${ticketId}`;
  const list = JSON.parse((await env.TICKETS.get(key)) ?? "[]") as string[];
  list.push(message);
  await env.TICKETS.put(key, JSON.stringify(list.slice(-50)));
}

export async function pendingSteers(env: Env, ticketId: string): Promise<string[]> {
  const all = JSON.parse((await env.TICKETS.get(`steers:${ticketId}`)) ?? "[]") as string[];
  const cursor = Number((await env.TICKETS.get(`steers-cursor:${ticketId}`)) ?? "0");
  return all.slice(cursor);
}

export async function consumeSteers(env: Env, ticketId: string): Promise<void> {
  const all = JSON.parse((await env.TICKETS.get(`steers:${ticketId}`)) ?? "[]") as string[];
  await env.TICKETS.put(`steers-cursor:${ticketId}`, String(all.length));
}
