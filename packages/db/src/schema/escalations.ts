// The `escalations` table — every model swap during a run.
//
// Two triggers, and the distinction matters: `fallback` is an AVAILABILITY swap
// (same capability, different credential, after a 429/401/5xx) and `promotion` is
// a CAPABILITY swap (a bigger model because the agent stalled). Fallback is
// exhausted first — promoting on a throttle pays more to fix something a bigger
// model cannot.

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const escalations = sqliteTable(
  "escalations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticketId: text("ticket_id").notNull(),
    runId: text("run_id").notNull(),
    // The column is `trigger_kind`, not `trigger` — TRIGGER is a SQL keyword.
    trigger: text("trigger_kind").notNull(),
    detail: text("detail").notNull(),
    stage: text("stage"),
    toModel: text("to_model"),
    at: text("at").notNull(),
  },
  (t) => [index("idx_esc_ticket").on(t.ticketId, t.runId)],
);

export type Escalation = typeof escalations.$inferSelect;
export type NewEscalation = typeof escalations.$inferInsert;
