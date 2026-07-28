// `db.notifications` — the operator input bus.

import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { type Notification, notifications } from "../schema";
import { Repo } from "./base";

export interface NotificationDraft {
  ticketId: string;
  source: string;
  kind?: string;
  body: string;
  author?: string;
  urgent?: boolean;
}

const MAX_BODY = 8000;

export class NotificationsRepo extends Repo {
  /**
   * Queue a notification and return it with its assigned sequence.
   *
   * The seq is allocated with a subquery rather than a read-then-write, so two
   * concurrent notifications cannot both read the same MAX and collide on the
   * (ticket_id, seq) primary key.
   */
  async queue(n: NotificationDraft): Promise<Notification> {
    const [inserted] = await this.d
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

  /** Unread notifications, oldest first. */
  async unread(ticketId: string): Promise<Notification[]> {
    return this.d
      .select()
      .from(notifications)
      .where(and(eq(notifications.ticketId, ticketId), isNull(notifications.readAt)))
      .orderBy(notifications.seq);
  }

  /** Full queue including read receipts, newest first (for the UI). */
  async list(ticketId: string, limit = 100): Promise<Notification[]> {
    return this.d
      .select()
      .from(notifications)
      .where(eq(notifications.ticketId, ticketId))
      .orderBy(desc(notifications.seq))
      .limit(limit);
  }

  /** Mark notifications read up to a seq (a read point consumed them). */
  async markRead(ticketId: string, upToSeq: number): Promise<void> {
    await this.d
      .update(notifications)
      .set({ readAt: new Date().toISOString() })
      .where(
        and(
          eq(notifications.ticketId, ticketId),
          lte(notifications.seq, upToSeq),
          // Don't overwrite an existing receipt — the FIRST read is the one that
          // consumed it, and re-stamping would lose when the operator's input
          // actually reached a stage.
          isNull(notifications.readAt),
        ),
      );
  }
}
