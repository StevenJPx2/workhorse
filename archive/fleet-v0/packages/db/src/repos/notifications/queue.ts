import { sql } from "drizzle-orm";
import { type Notification, notifications } from "#schema";
import type { Conn } from "#repos/bind";
import { MAX_BODY, type NotificationDraft } from "./types";

/**
 * Queue a notification and return it with its assigned sequence.
 *
 * The seq is allocated INSIDE the insert. A read-then-write lets two concurrent
 * notifications read the same MAX and collide on the (ticket_id, seq) primary
 * key.
 */
export async function queue(d: Conn, n: NotificationDraft): Promise<Notification> {
  const [inserted] = await d
    .insert(notifications)
    .values({
      ticketId: n.ticketId,
      seq: sql<number>`(SELECT COALESCE(MAX(seq), 0) + 1 FROM notifications WHERE ticket_id = ${n.ticketId})`,
      source: n.source,
      kind: n.kind ?? "comment",
      body: n.body.slice(0, MAX_BODY),
      author: n.author ?? null,
      urgent: n.urgent ?? false,
      createdAt: new Date().toISOString(),
      readAt: null,
    })
    .returning();

  return inserted;
}
