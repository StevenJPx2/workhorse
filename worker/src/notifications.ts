// Notification bus: operator input from ANY surface queues per-ticket and
// is read at workflow-declared points instead of interrupting. The
// WORKFLOW decides where it listens; `urgent` preserves live-steer
// semantics (delivered into the running session at the next turn).

import type { Env } from "@workhorse/api";
import { appendSteer, wakeTicket } from "./events";

export interface Notification {
  ticketId: string;
  seq: number;
  source: string; // "ui" | "github" | "slack" | "jira" | plugin id
  kind: string; // "comment" | "review" | "context" | "accepted" | ...
  body: string;
  author?: string;
  urgent: boolean;
  createdAt: string;
  readAt?: string;
}

interface Row {
  ticket_id: string;
  seq: number;
  source: string;
  kind: string;
  body: string;
  author: string | null;
  urgent: number;
  created_at: string;
  read_at: string | null;
}

function toNotification(r: Row): Notification {
  return {
    ticketId: r.ticket_id,
    seq: r.seq,
    source: r.source,
    kind: r.kind,
    body: r.body,
    author: r.author ?? undefined,
    urgent: r.urgent === 1,
    createdAt: r.created_at,
    readAt: r.read_at ?? undefined,
  };
}

/**
 * Queue a notification. Urgent notifications ALSO become a live steer
 * (delivered into the running session next turn) and wake parked runs —
 * the bus subsumes both prior paths without losing their semantics.
 */
export async function notify(
  env: Env,
  n: {
    ticketId: string;
    source: string;
    kind?: string;
    body: string;
    author?: string;
    urgent?: boolean;
  },
): Promise<Notification> {
  const seqRow = await env.DB.prepare(
    "SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM notifications WHERE ticket_id = ?",
  )
    .bind(n.ticketId)
    .first<{ next: number }>();
  const seq = seqRow?.next ?? 1;
  const createdAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO notifications (ticket_id, seq, source, kind, body, author, urgent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      n.ticketId,
      seq,
      n.source,
      n.kind ?? "comment",
      n.body.slice(0, 8000),
      n.author ?? null,
      n.urgent ? 1 : 0,
      createdAt,
    )
    .run();
  if (n.urgent) {
    // Live path: steer the running session; wake if parked.
    await appendSteer(env, n.ticketId, `[${n.source}${n.author ? ` · ${n.author}` : ""}] ${n.body.slice(0, 4000)}`);
    await wakeTicket(env, n.ticketId);
  }
  return { ...n, kind: n.kind ?? "comment", urgent: !!n.urgent, seq, createdAt };
}

/** Unread notifications, oldest first. */
export async function unreadNotifications(env: Env, ticketId: string): Promise<Notification[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM notifications WHERE ticket_id = ? AND read_at IS NULL ORDER BY seq",
  )
    .bind(ticketId)
    .all<Row>();
  return (results ?? []).map(toNotification);
}

/** Full queue (read receipts included) for the UI. */
export async function listNotifications(env: Env, ticketId: string, limit = 100): Promise<Notification[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM notifications WHERE ticket_id = ? ORDER BY seq DESC LIMIT ?",
  )
    .bind(ticketId, limit)
    .all<Row>();
  return (results ?? []).map(toNotification);
}

/** Mark notifications read (a read point consumed them). */
export async function markNotificationsRead(env: Env, ticketId: string, upToSeq: number): Promise<void> {
  await env.DB.prepare(
    "UPDATE notifications SET read_at = ? WHERE ticket_id = ? AND seq <= ? AND read_at IS NULL",
  )
    .bind(new Date().toISOString(), ticketId, upToSeq)
    .run();
}

/** Render unread notifications as the prompt section a read point injects. */
export function renderNotifications(items: Notification[]): string {
  if (!items.length) return "";
  const lines = items.map(
    (n) =>
      `- [#${n.seq} · ${n.source}${n.author ? ` · ${n.author}` : ""} · ${n.kind}] ${n.body.slice(0, 1500)}`,
  );
  return [
    "## Operator notifications (unread)",
    "",
    "Messages queued for this run from operators and connected surfaces.",
    "Acknowledge each: incorporate what changes your work, answer questions",
    "in your analysis, and note anything you deliberately did not act on.",
    "",
    ...lines,
  ].join("\n");
}
