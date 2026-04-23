import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { dateText } from "./custom-types.ts";

/** Valid issue statuses */
export type IssueStatus =
  | "pending"
  | "queued"
  | "planning"
  | "implementing"
  | "blocked"
  | "pr_created"
  | "in_review"
  | "done";

/**
 * Issues table - tracks issues from external sources (Jira, GitHub, etc.)
 */
export const issues = sqliteTable(
  "issues",
  {
    id: text("id").primaryKey(),
    externalId: text("external_id").notNull(),
    source: text("source").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("pending").$type<IssueStatus>(),
    issueType: text("issue_type").notNull().default("task"),
    url: text("url"),
    assignee: text("assignee"),
    labels: text("labels", { mode: "json" }).$type<string[]>(),
    metadata: text("metadata", { mode: "json" }).notNull().$type<Record<string, unknown>>(),
    worktreePath: text("worktree_path"),
    prUrl: text("pr_url"),
    prNumber: integer("pr_number"),
    createdAt: dateText("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: dateText("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [uniqueIndex("issues_external_source_idx").on(table.externalId, table.source)],
);

/** Issue type derived from schema */
export type Issue = typeof issues.$inferSelect;

/** Zod schema for validating issue status */
export const IssueStatusSchema = z.enum([
  "pending",
  "queued",
  "planning",
  "implementing",
  "blocked",
  "pr_created",
  "in_review",
  "done",
]);
