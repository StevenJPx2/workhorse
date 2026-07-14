// Ticket event store (KV): append-only list + consumed cursor. The webhook
// route appends and best-effort wakes the parked workflow; the workflow's
// revision loop reads everything past the cursor.

import type { ExternalEvent } from "./plugins/types";
import type { Env } from "./types";

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

export async function consumeEvents(env: Env, ticketId: string): Promise<void> {
  const all = JSON.parse((await env.TICKETS.get(`events:${ticketId}`)) ?? "[]") as ExternalEvent[];
  await env.TICKETS.put(`events-cursor:${ticketId}`, String(all.length));
}
