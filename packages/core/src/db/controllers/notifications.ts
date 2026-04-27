import { and, eq, inArray } from "drizzle-orm";
import type { InsertNotification, Notification } from "#db";
import { notifications } from "../schema";
import type { DrizzleDb } from "../types.ts";

/**
 * Controller for Notification operations
 */
export class NotificationController {
  constructor(private db: DrizzleDb) {}

  /**
   * Create a new notification. Fields with defaults (id, status, timestamps) are optional.
   */
  create(input: InsertNotification): Notification {
    return this.db.insert(notifications).values(input).returning().get()!;
  }

  /**
   * Get all unread notifications for an issue
   */
  getUnread(issueId: string): Notification[] {
    return this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.issueId, issueId), eq(notifications.status, "unread")))
      .all();
  }

  /**
   * Mark a notification as read
   */
  markRead(id: string): void {
    this.db
      .update(notifications)
      .set({ status: "read", readAt: new Date() })
      .where(eq(notifications.id, id))
      .run();
  }

  /**
   * Mark a notification as acknowledged
   */
  markAcknowledged(id: string): void {
    this.db
      .update(notifications)
      .set({ status: "acknowledged", acknowledgedAt: new Date() })
      .where(eq(notifications.id, id))
      .run();
  }

  /**
   * Acknowledge multiple notifications at once
   */
  acknowledgeMany(ids: string[]): void {
    if (ids.length === 0) return;

    this.db
      .update(notifications)
      .set({ status: "acknowledged", acknowledgedAt: new Date() })
      .where(inArray(notifications.id, ids))
      .run();
  }

  /**
   * Find a notification by its source-specific ID.
   * Used for deduplication when creating notifications.
   */
  findBySourceId(sourceId: string): Notification | undefined {
    return this.db.select().from(notifications).where(eq(notifications.sourceId, sourceId)).get();
  }
}
