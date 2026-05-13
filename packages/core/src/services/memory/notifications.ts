import type { Database, Notification } from "#db";
import type { HookEmitter } from "#lib/hooks";
import { generateSystemInbox } from "./inbox.ts";
import type { CreateNotificationInput } from "./types.ts";

/**
 * NotificationService - Manages notifications for issues.
 *
 * Provides notification creation with deduplication, status management,
 * and system inbox generation for agent prompts.
 *
 * @example
 * ```typescript
 * const notifications = new NotificationService(db, hooks);
 *
 * // Create a notification (deduplicates by sourceId)
 * const notification = await notifications.create({
 *   issueId: "AM-123",
 *   source: "jira",
 *   sourceId: "jira-comment-456",
 *   title: "New comment",
 *   body: "Please review the implementation"
 * });
 *
 * // Get unread notifications
 * const unread = await notifications.getUnread("AM-123");
 *
 * // Generate XML for system prompt
 * const xml = notifications.generateInbox(unread);
 *
 * // Mark as read/acknowledged
 * await notifications.markRead(notification.id);
 * await notifications.acknowledge([notification.id]);
 * ```
 */
export class NotificationService {
  /**
   * Create a new NotificationService.
   *
   * @param db - Database instance
   * @param hooks - Event emitter for hook integration
   */
  constructor(
    private db: Database,
    private hooks: HookEmitter,
  ) {}

  /**
   * Create a new notification.
   *
   * Handles deduplication via sourceId - if a notification with the same
   * sourceId already exists, the existing notification is returned instead.
   *
   * @param input - Notification creation input
   * @returns Created or existing notification
   */
  async create(input: CreateNotificationInput): Promise<Notification> {
    // Check for duplicate via sourceId
    if (input.sourceId) {
      const existing = await this.db.notifications.findBySourceId(input.sourceId);
      if (existing) {
        return existing;
      }
    }

    // Create notification with defaults for optional fields
    const notification = await this.db.notifications.create({
      ...input,
      sourceId: input.sourceId ?? null,
      priority: input.priority ?? "normal",
      metadata: input.metadata ?? null,
    });

    // Emit hook with external ID (consistent with other agent.* hooks)
    // Look up issue to get external ID for hook (input.issueId is internal UUID)
    this.hooks.emit("notification.created", {
      notification,
      issueId: await this.db.issues
        .getById(input.issueId)
        .then((issue) => issue?.externalId ?? input.issueId),
    });

    return notification;
  }

  /**
   * Get all unread notifications for an issue.
   *
   * @param issueId - Issue ID to get notifications for
   * @returns Array of unread notifications
   */
  async getUnread(issueId: string): Promise<Notification[]> {
    return this.db.notifications.getUnread(issueId);
  }

  /**
   * Generate a system inbox XML string from notifications.
   *
   * @param notifications - Notifications to include in inbox
   * @returns XML string for system prompt inclusion
   */
  generateInbox(notifications: Notification[]): string {
    return generateSystemInbox(notifications);
  }

  /**
   * Mark a notification as read.
   *
   * @param id - Notification ID
   */
  async markRead(id: string): Promise<void> {
    await this.db.notifications.markRead(id);
  }

  /**
   * Acknowledge multiple notifications at once.
   *
   * @param ids - Notification IDs to acknowledge
   */
  async acknowledge(ids: string[]): Promise<void> {
    await this.db.notifications.acknowledgeMany(ids);
  }
}
