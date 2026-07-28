import { eq } from "drizzle-orm";
import { traces } from "#schema";
import type { Conn } from "#repos/bind";
import type { TraceIndexEntry } from "./types";

/** A ticket's traces, oldest archive first. */
export async function list(d: Conn, ticketId: string): Promise<TraceIndexEntry[]> {
  return d
    .select({ runId: traces.runId, kind: traces.kind, archivedAt: traces.archivedAt })
    .from(traces)
    .where(eq(traces.ticketId, ticketId))
    .orderBy(traces.archivedAt);
}
