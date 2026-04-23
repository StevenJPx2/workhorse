export { Database } from "./database.ts";

// Re-export schema tables and types
export {
  // Tables
  issues,
  issueEvents,
  notifications,
  // Custom column types
  dateText,
  nullableDateText,
} from "./schema/index.ts";

// Domain types (derived from schema)
export type {
  Issue,
  IssueStatus,
  IssueEvent,
  Notification,
  NotificationPriority,
  NotificationStatus,
} from "./schema/index.ts";

// Zod schemas for runtime validation
export {
  IssueStatusSchema,
  NotificationPrioritySchema,
  NotificationStatusSchema,
} from "./schema/index.ts";
