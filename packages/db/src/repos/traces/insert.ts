import { traces } from "../../schema";
import type { Conn } from "../bind";

/**
 * Index an archived trace. Idempotent on (ticketId, runId): re-archiving the
 * same run is not an error, and the FIRST archive time stands.
 */
export async function insert(
  d: Conn,
  t: { ticketId: string; runId: string; kind: string; archivedAt: string },
): Promise<void> {
  await d.insert(traces).values(t).onConflictDoNothing();
}
