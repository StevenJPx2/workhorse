import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";

import { customJsonb, dateText, nullableDateText } from "./custom-types.ts";
import { issues } from "./issues.ts";

/** Valid notification priorities */
export type NotificationPriority = "blocking" | "high" | "normal" | "low";

/** Valid notification statuses */
export type NotificationStatus = "unread" | "read" | "acknowledged";

/**
 * Notifications table - tracks notifications for issues
 */
export const notifications = sqliteTable("notifications", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  issueId: text("issue_id")
    .notNull()
    .references(() => issues.id),
  source: text("source").notNull(),
  sourceId: text("source_id").unique(),
  priority: text("priority")
    .notNull()
    .default("normal")
    .$type<NotificationPriority>(),
  status: text("status")
    .notNull()
    .default("unread")
    .$type<NotificationStatus>(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  metadata: customJsonb("metadata"),
  createdAt: dateText("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  readAt: nullableDateText("read_at"),
  acknowledgedAt: nullableDateText("acknowledged_at"),
});

/** Notification type derived from schema */
export type Notification = typeof notifications.$inferSelect;

/** Insert type - fields with defaults are optional */
export type InsertNotification = typeof notifications.$inferInsert;

/** Zod schema for validating notification priority */
export const NotificationPrioritySchema = z.enum([
  "blocking",
  "high",
  "normal",
  "low",
]);

/** Zod schema for validating notification status */
export const NotificationStatusSchema = z.enum([
  "unread",
  "read",
  "acknowledged",
]);

/** Zod schema for validating Notification objects (generated from Drizzle table) */
export const NotificationSchema = createSelectSchema(notifications);
