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
  async create(input: InsertNotification): Promise<Notification> {
    return await this.db
      .insert(notifications)
      .values(input)
      .returning()
      .then((r) => r[0]!);
  }

  /**
   * Get all unread notifications for an issue
   */
  async getUnread(issueId: string): Promise<Notification[]> {
    return this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.issueId, issueId), eq(notifications.status, "unread")));
  }

  /**
   * Mark a notification as read
   */
  async markRead(id: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ status: "read", readAt: new Date() })
      .where(eq(notifications.id, id));
  }

  /**
   * Mark a notification as acknowledged
   */
  async markAcknowledged(id: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ status: "acknowledged", acknowledgedAt: new Date() })
      .where(eq(notifications.id, id));
  }

  /**
   * Acknowledge multiple notifications at once
   */
  async acknowledgeMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await this.db
      .update(notifications)
      .set({ status: "acknowledged", acknowledgedAt: new Date() })
      .where(inArray(notifications.id, ids));
  }

  /**
   * Find a notification by its source-specific ID.
   * Used for deduplication when creating notifications.
   */
  async findBySourceId(sourceId: string): Promise<Notification | undefined> {
    return await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.sourceId, sourceId))
      .then((r) => r[0]);
  }

  /**
   * Delete all notifications for an issue.
   * Used when deleting an issue to clean up related data.
   */
  async deleteByIssueId(issueId: string): Promise<void> {
    await this.db.delete(notifications).where(eq(notifications.issueId, issueId));
  }
}
