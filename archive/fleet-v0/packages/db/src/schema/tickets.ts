// The `tickets` table — the fleet's unit of work.
//
// COLUMN NAMES ARE FROZEN. There is live production data here, so every
// snake_case name matches what already exists. Renaming one silently generates a
// destructive migration.

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * A ticket's lifecycle state.
 *
 * `done` is set ONLY by an external source (PR merged, issue transition) —
 * never by the agent. That is the core control property: the agent does work,
 * the system decides completion.
 */
export const TICKET_STATUSES = [
  "queued",
  "planning",
  "implementing",
  /** Adversarial review pass before the PR goes up. */
  "ready-for-review",
  /** A stage requested operator input mid-run. */
  "awaiting-input",
  "in-review",
  /** Report/artifact outcome offered; operator accepts. */
  "awaiting-acceptance",
  "done",
  "errored",
  "terminated",
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const tickets = sqliteTable(
  "tickets",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    repo: text("repo").notNull(),
    prompt: text("prompt").notNull(),
    // $type narrows the TS type without adding a CHECK constraint — the union is
    // enforced at the boundary, and a stored value outside it stays readable
    // rather than making the row unfetchable.
    status: text("status").notNull().$type<TicketStatus>(),
    // TEXT ISO-8601, not epoch millis: read by humans in the UI and by ORDER BY
    // in SQL, and ISO-8601 sorts lexicographically.
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    plan: text("plan"),
    result: text("result"),
    error: text("error"),
    branch: text("branch"),
    prUrl: text("pr_url"),
    runId: text("run_id"),
    /** Which baked workflow bundle drives this ticket (default "coding"). */
    workflow: text("workflow"),
    /**
     * Current workflow instance. Equals the ticket id for the first instance;
     * healing re-dispatches append -h<n>. Wake/stop/status must target THIS,
     * not the ticket id.
     */
    wfInstance: text("wf_instance"),
    healAttempts: integer("heal_attempts").notNull().default(0),
  },
  (t) => [
    index("idx_tickets_status").on(t.status),
    index("idx_tickets_repo").on(t.repo),
    index("idx_tickets_updated").on(t.updatedAt),
  ],
);

export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
