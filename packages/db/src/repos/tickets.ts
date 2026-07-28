// `db.tickets` — the fleet's units of work.

import type { TicketRecord } from "@workhorse/api";
import { desc, eq, max } from "drizzle-orm";
import { type Ticket, type TicketStatus, tickets } from "../schema";
import { Repo } from "./base";

/**
 * Columns that are nullable in SQL and optional in the API. Listing them once
 * keeps the two mappings below as data rather than eighteen hand-written
 * `?? undefined` branches — which is also where a missed field would hide.
 */
const NULLABLE_FIELDS = [
  "plan",
  "result",
  "error",
  "branch",
  "prUrl",
  "runId",
  "workflow",
  "wfInstance",
] as const satisfies ReadonlyArray<keyof TicketRecord & keyof Ticket>;

/**
 * Adapt a row to the API's `TicketRecord`, which uses `undefined` for absent
 * values where SQL uses `null`.
 *
 * Unlike the hand-written row interface it replaces, its input type is inferred
 * from the schema — so adding a column or changing one's type surfaces as a type
 * error here rather than a silently dropped field.
 */
export function toTicketRecord(r: Ticket): TicketRecord {
  const rec: TicketRecord = {
    id: r.id,
    title: r.title,
    repo: r.repo,
    prompt: r.prompt,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    // 0 means "never healed", which the API represents as absent.
    healAttempts: r.healAttempts || undefined,
  };

  for (const key of NULLABLE_FIELDS) rec[key] = r[key] ?? undefined;
  return rec;
}

/** The inverse: an API record as an insertable row. */
function toRow(rec: TicketRecord): Ticket {
  const row: Ticket = {
    id: rec.id,
    title: rec.title,
    repo: rec.repo,
    prompt: rec.prompt,
    status: rec.status,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    healAttempts: rec.healAttempts ?? 0,
    // Filled from NULLABLE_FIELDS below; declared so the object is complete for
    // the type.
    plan: null,
    result: null,
    error: null,
    branch: null,
    prUrl: null,
    runId: null,
    workflow: null,
    wfInstance: null,
  };

  for (const key of NULLABLE_FIELDS) row[key] = rec[key] ?? null;
  return row;
}

export class TicketsRepo extends Repo {
  async get(id: string): Promise<TicketRecord | null> {
    const [row] = await this.d.select().from(tickets).where(eq(tickets.id, id)).limit(1);
    return row ? toTicketRecord(row) : null;
  }

  /** Insert or fully replace a ticket. */
  async put(rec: TicketRecord): Promise<void> {
    const row = toRow(rec);
    await this.d
      .insert(tickets)
      .values(row)
      // Not INSERT OR REPLACE, which DELETEs then INSERTs — firing delete
      // triggers and losing any column absent from the statement.
      .onConflictDoUpdate({ target: tickets.id, set: row });
  }

  /** Patch a ticket; returns prev+next so transition hooks can diff them. */
  async patch(
    id: string,
    patch: Partial<TicketRecord>,
  ): Promise<{ prev: TicketRecord; next: TicketRecord } | null> {
    const prev = await this.get(id);
    if (!prev) return null;

    const next: TicketRecord = { ...prev, ...patch, updatedAt: new Date().toISOString() };
    await this.put(next);
    return { prev, next };
  }

  async list(status?: string): Promise<TicketRecord[]> {
    const q = this.d.select().from(tickets).orderBy(desc(tickets.createdAt));
    const rows = await (status ? q.where(eq(tickets.status, status as TicketStatus)) : q);
    return rows.map(toTicketRecord);
  }

  /** Repos seen in the fleet, most recently used first (home-page chips). */
  async knownRepos(limit = 20): Promise<string[]> {
    const rows = await this.d
      .select({ repo: tickets.repo, last: max(tickets.updatedAt) })
      .from(tickets)
      .groupBy(tickets.repo)
      // By each repo's LATEST ticket — a plain DISTINCT would order by whichever
      // row the planner saw first.
      .orderBy(desc(max(tickets.updatedAt)))
      .limit(limit);
    return rows.map((r) => r.repo);
  }
}
