import { desc, eq } from "drizzle-orm";
import { type Notification, notifications } from "../../schema";
import type { Conn } from "../bind";

/** Full queue including read receipts, newest first (for the UI). */
export async function list(d: Conn, ticketId: string, limit = 100): Promise<Notification[]> {
  return d
    .select()
    .from(notifications)
    .where(eq(notifications.ticketId, ticketId))
    .orderBy(desc(notifications.seq))
    .limit(limit);
}
