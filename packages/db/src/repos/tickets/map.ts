// Row ⇄ API-record mapping for tickets.
//
// SQL uses `null` for absent; the API's TicketRecord uses `undefined`. Keeping
// the conversion in one place — driven by a list of the nullable columns — means
// adding a column is a one-line change rather than two hand-written branches, and
// a forgotten field shows up as a type error instead of a silently dropped value.

import type { TicketRecord } from "@workhorse/api";
import type { Ticket } from "../../schema";

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

/** A row as the API's TicketRecord. */
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

/** An API record as an insertable row. */
export function toTicketRow(rec: TicketRecord): Ticket {
  const row: Ticket = {
    id: rec.id,
    title: rec.title,
    repo: rec.repo,
    prompt: rec.prompt,
    status: rec.status,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    healAttempts: rec.healAttempts ?? 0,
    // Filled from NULLABLE_FIELDS below; declared so the object is complete.
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
