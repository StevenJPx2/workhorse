// `db.escalations` — model swaps during a run.

import { and, eq } from "drizzle-orm";
import { escalations, type NewEscalation } from "../schema";
import { Repo } from "./base";

/** One escalation, with SQL nulls mapped to absent. */
export interface EscalationEntry {
  trigger: string;
  detail: string;
  stage?: string;
  toModel?: string;
  at: string;
}

export class EscalationsRepo extends Repo {
  async insert(e: NewEscalation): Promise<void> {
    await this.d.insert(escalations).values(e);
  }

  /** Every escalation for one run, chronological — the trace's model history. */
  async forRun(ticketId: string, runId: string): Promise<EscalationEntry[]> {
    const rows = await this.d
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
}
