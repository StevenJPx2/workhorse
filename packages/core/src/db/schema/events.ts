import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { dateText } from "./custom-types.ts";
import { issues } from "./issues.ts";

/**
 * Issue events table - tracks events/activity for issues
 */
export const issueEvents = sqliteTable("issue_events", {
  id: text("id").primaryKey(),
  issueId: text("issue_id")
    .notNull()
    .references(() => issues.id),
  type: text("type").notNull(),
  message: text("message").notNull(),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: dateText("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

/** IssueEvent type derived from schema */
export type IssueEvent = typeof issueEvents.$inferSelect;
