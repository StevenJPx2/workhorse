/**
 * Notification types - re-exported from database schema
 *
 * The schema is the single source of truth for these types.
 * They are derived from the Drizzle ORM table definitions.
 */
export type {
  Notification,
  NotificationPriority,
  NotificationStatus,
} from "../db/schema/notifications.ts";
