import { and, eq } from "drizzle-orm";
import { escalations } from "#schema";
import type { Conn } from "#repos/bind";
import type { EscalationEntry } from "./types";

/** Every escalation for one run, chronological — the trace's model history. */
export async function forRun(d: Conn, ticketId: string, runId: string): Promise<EscalationEntry[]> {
  const rows = await d
    .select()
    .from(escalations)
    .where(and(eq(escalations.ticketId, ticketId), eq(escalations.runId, runId)))
    .orderBy(escalations.at);

  return rows.map((r) => ({
    trigger: r.trigger,
    detail: r.detail,
    stage: r.stage ?? undefined,
    toModel: r.toModel ?? undefined,
    at: r.at,
  }));
}
