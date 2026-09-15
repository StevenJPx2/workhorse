// The `notifications` table — the operator input bus.
//
// Input from ANY surface queues per ticket and is read at workflow-declared
// points instead of interrupting. The WORKFLOW decides where it listens;
// `urgent` additionally becomes a live steer delivered into the running session
// at its next turn.

import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
    // never see the integer. The hand-rolled layer this replaced compared
    // `urgent === 1` at every read site, and one missed site would have made
    // every notification urgent.
    urgent: integer("urgent", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    readAt: text("read_at"),
  },
  (t) => [
    primaryKey({ columns: [t.ticketId, t.seq] }),
    index("idx_notifications_unread").on(t.ticketId, t.readAt),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
