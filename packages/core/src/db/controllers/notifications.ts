import { eq, and, inArray } from "drizzle-orm";
import { notifications } from "../schema";
import type { DrizzleDb } from "../types.ts";
import type { Notification } from "#db";

/**
 * Controller for Notification operations
 */
export class NotificationController {
  constructor(private db: DrizzleDb) {}

  /**
   * Create a new notification
   */
  create(
    input: Omit<Notification, "id" | "createdAt" | "readAt" | "acknowledgedAt" | "status">,
  ): Notification {
    const id = crypto.randomUUID();

    this.db
      .insert(notifications)
      .values({ ...input, id, status: "unread", createdAt: new Date() })
      .run();

    return this.getById(id)!;
  }

  /**
   * Get a notification by ID (internal use)
   */
  private getById(id: string): Notification | undefined {
    return this.db.select().from(notifications).where(eq(notifications.id, id)).get();
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
    const now = new Date();
    this.db
      .update(notifications)
      .set({ status: "read", readAt: now })
      .where(eq(notifications.id, id))
      .run();
  }

  /**
   * Mark a notification as acknowledged
   */
  markAcknowledged(id: string): void {
    const now = new Date();
    this.db
      .update(notifications)
      .set({ status: "acknowledged", acknowledgedAt: now })
      .where(eq(notifications.id, id))
      .run();
  }

  /**
   * Acknowledge multiple notifications at once
   */
  acknowledgeMany(ids: string[]): void {
    if (ids.length === 0) return;

    const now = new Date();
    this.db
      .update(notifications)
      .set({ status: "acknowledged", acknowledgedAt: now })
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
