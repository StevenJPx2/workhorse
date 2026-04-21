/**
 * Database schema barrel export
 *
 * Re-exports all tables and types from individual schema files.
 * This follows the Drizzle ORM multi-file schema pattern:
 * https://orm.drizzle.team/docs/sql-schema-declaration
 */

// Custom column types
export { dateText, nullableDateText } from "./custom-types.ts";

// Tables
export { issues } from "./issues.ts";
export { issueEvents } from "./events.ts";
export { notifications } from "./notifications.ts";

// Domain types (derived from schema)
export type { Issue, IssueStatus } from "./issues.ts";
export type { IssueEvent } from "./events.ts";
export type { Notification, NotificationPriority, NotificationStatus } from "./notifications.ts";
