// D1 schema as code. This file is the single source of truth for the relational
// plane — `drizzle-kit generate` derives migrations from it, and the query layer
// derives its types from it.
//
// COLUMN NAMES ARE FROZEN. There is live production data in these tables, so
// every snake_case name below matches what already exists. Renaming a column
// here silently generates a destructive migration.
//
// Timestamps are TEXT ISO-8601, not integers: they are read by humans in the UI
// and by `ORDER BY` in SQL, and ISO-8601 sorts lexicographically. Storing epoch
// millis would be marginally smaller and much worse to debug.

import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** A ticket's lifecycle state. `done` is set ONLY by an external source. */
export const TICKET_STATUSES = [
  "queued",
  "planning",
  "implementing",
  "ready-for-review",
  "awaiting-input",
  "in-review",
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

/** A model swap during a run: `fallback` for availability, `promotion` for capability. */
export const escalations = sqliteTable(
  "escalations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticketId: text("ticket_id").notNull(),
    runId: text("run_id").notNull(),
    // Column is `trigger_kind`, not `trigger` — TRIGGER is a SQL keyword.
    trigger: text("trigger_kind").notNull(),
    detail: text("detail").notNull(),
    stage: text("stage"),
    toModel: text("to_model"),
    at: text("at").notNull(),
  },
  (t) => [index("idx_esc_ticket").on(t.ticketId, t.runId)],
);

/**
 * Queryable index over archived run traces. The trace BODY is an immutable R2
 * blob (no size ceiling); only the index is relational.
 */
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

/**
 * Operator input queued per ticket, read at workflow-declared points rather
 * than interrupting. `urgent` additionally becomes a live steer.
 */
export const notifications = sqliteTable(
  "notifications",
  {
    ticketId: text("ticket_id").notNull(),
    /** Per-ticket monotonic sequence. Read points consume up to a seq. */
    seq: integer("seq").notNull(),
    /** "ui" | "github" | "slack" | "jira" | plugin id */
    source: text("source").notNull(),
    /** "comment" | "review" | "context" | "accepted" | ... */
    kind: text("kind").notNull().default("comment"),
    body: text("body").notNull(),
    author: text("author"),
    // SQLite has no boolean; mode:"boolean" maps 0/1 at the driver so callers
    // never see the integer. The old hand-rolled layer did `urgent === 1` by
    // hand at every read site.
    urgent: integer("urgent", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    readAt: text("read_at"),
  },
  (t) => [
    primaryKey({ columns: [t.ticketId, t.seq] }),
    index("idx_notifications_unread").on(t.ticketId, t.readAt),
  ],
);

/** A declared argument of a script. Stored inside the `args` JSON column. */
export interface ScriptArg {
  name: string;
  description?: string;
  required?: boolean;
}

/**
 * Agent self-extension: a named, replayable Code Mode program. Scope is
 * "global" or "repo:<owner/repo>", with repo scope winning name clashes.
 */
export const scripts = sqliteTable(
  "scripts",
  {
    scope: text("scope").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** TypeScript body. Args arrive as the `args` object (args.<name>). */
    code: text("code").notNull(),
    // mode:"json" parses and serializes at the driver. The old layer called
    // JSON.parse(r.args || "[]") by hand and could hand back `any`.
    args: text("args", { mode: "json" }).notNull().$type<ScriptArg[]>().default([]),
    /**
     * Ticket statuses allowed to run this script; empty = any.
     *
     * Typed `string[]` rather than `TicketStatus[]` on purpose: membership is
     * enforced by `validateScript` at the registration boundary, and narrowing
     * here would make `Script` structurally incompatible with the API's
     * `ScriptRecord` — forcing a cast at every call site to buy a guarantee the
     * validator already provides.
     */
    statusGates: text("status_gates", { mode: "json" }).notNull().$type<string[]>().default([]),
    createdBy: text("created_by").notNull().$type<"agent" | "user" | "seed">(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.scope, t.name] })],
);

// Row types inferred from the schema — no hand-written interface can drift.
export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type Escalation = typeof escalations.$inferSelect;
export type NewEscalation = typeof escalations.$inferInsert;
export type Trace = typeof traces.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Script = typeof scripts.$inferSelect;
export type NewScript = typeof scripts.$inferInsert;
