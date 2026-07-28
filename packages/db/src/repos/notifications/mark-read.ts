import { and, eq, isNull, lte } from "drizzle-orm";
import { notifications } from "../../schema";
import type { Conn } from "../bind";

/** Mark notifications read up to a seq (a read point consumed them). */
export async function markRead(d: Conn, ticketId: string, upToSeq: number): Promise<void> {
  await d
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
