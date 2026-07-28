// The `traces` table — a queryable index over archived run traces.
//
// The trace BODY is an immutable R2 blob (no size ceiling); only the index is
// relational. The composite primary key makes re-archiving the same run
// idempotent rather than an error.

import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const traces = sqliteTable(
  "traces",
  {
    ticketId: text("ticket_id").notNull(),
    runId: text("run_id").notNull(),
    kind: text("kind").notNull(),
    archivedAt: text("archived_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.ticketId, t.runId] })],
);

export type Trace = typeof traces.$inferSelect;
export type NewTrace = typeof traces.$inferInsert;
