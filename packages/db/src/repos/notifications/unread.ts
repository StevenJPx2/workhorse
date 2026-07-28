import { and, eq, isNull } from "drizzle-orm";
import { type Notification, notifications } from "../../schema";
import type { Conn } from "../bind";

/** Unread notifications, oldest first — what a read point injects. */
export async function unread(d: Conn, ticketId: string): Promise<Notification[]> {
  return d
    .select()
    .from(notifications)
    .where(and(eq(notifications.ticketId, ticketId), isNull(notifications.readAt)))
    .orderBy(notifications.seq);
}
