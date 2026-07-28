// `db.traces` — the queryable index over archived run traces.

import { eq } from "drizzle-orm";
import { traces } from "../schema";
import { Repo } from "./base";

export interface TraceIndexEntry {
  runId: string;
  kind: string;
  archivedAt: string;
}

export class TracesRepo extends Repo {
  async insert(t: { ticketId: string; runId: string; kind: string; archivedAt: string }): Promise<void> {
    // Re-archiving the same run is idempotent, not an error. The first archive
    // time stands.
    await this.d.insert(traces).values(t).onConflictDoNothing();
  }

  async list(ticketId: string): Promise<TraceIndexEntry[]> {
    return this.d
      .select({ runId: traces.runId, kind: traces.kind, archivedAt: traces.archivedAt })
      .from(traces)
      .where(eq(traces.ticketId, ticketId))
      .orderBy(traces.archivedAt);
  }
}
