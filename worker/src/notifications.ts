// Notification bus: operator input from ANY surface queues per-ticket and
// is read at workflow-declared points instead of interrupting. The
// WORKFLOW decides where it listens; `urgent` preserves live-steer
// semantics (delivered into the running session at the next turn).
//
// Storage lives in @workhorse/db; this file owns the SIDE EFFECTS of queueing
// (steer + wake) and the prompt rendering, which are workflow concerns rather
// than database ones.

import type { Env } from "@workhorse/api";
import type { Notification } from "@workhorse/db";
import { db } from "./db";
import { appendSteer, wakeTicket } from "./events";

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
  const queued = await db(env).notifications.queue(n);

  if (n.urgent) {
    // Live path: steer the running session; wake if parked.
    await appendSteer(env, n.ticketId, `[${n.source}${n.author ? ` · ${n.author}` : ""}] ${n.body.slice(0, 4000)}`);
    await wakeTicket(env, n.ticketId);
  }

  return queued;
}

/** Render unread notifications as the prompt section a read point injects. */
export function renderNotifications(items: Notification[]): string {
  if (!items.length) return "";

  const lines = items.map(
    (n) => `- [#${n.seq} · ${n.source}${n.author ? ` · ${n.author}` : ""} · ${n.kind}] ${n.body.slice(0, 1500)}`,
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
