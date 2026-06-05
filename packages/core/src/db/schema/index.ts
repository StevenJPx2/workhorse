/**
 * Database schema barrel export
 *
 * Re-exports all tables and types from individual schema files.
 * This follows the Drizzle ORM multi-file schema pattern:
 * https://orm.drizzle.team/docs/sql-schema-declaration
 */

// Custom column types
export { dateText, nullableDateText } from "./custom-types.ts";
export type { InsertIssueEvent, IssueEvent } from "./events.ts";
export { issueEvents } from "./events.ts";
// Domain types (derived from schema)
export type { InsertIssue, Issue, IssueStatus } from "./issues.ts";
// Tables
// Zod schemas for runtime validation
export { IssueSchema, IssueStatusSchema, issues, STATUSES } from "./issues.ts";
export type {
  InsertNotification,
  Notification,
  NotificationPriority,
  NotificationStatus,
} from "./notifications.ts";
export {
  NotificationPrioritySchema,
  NotificationSchema,
  NotificationStatusSchema,
  notifications,
} from "./notifications.ts";
