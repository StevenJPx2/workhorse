/**
 * Notification store - SQLite operations for notifications
 */

import { Database } from "bun:sqlite";
import { migrateNotifications } from "../../lib/db/migrations/notifications.ts";
import type { Notification, CreateNotificationInput, NotificationSourceType } from "./types.ts";

/**
 * Generate a unique ID for a notification
 */
function generateId(): string {
  return `notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Initialize the notifications table (for testing)
 * Delegates to the shared migration
 */
export function initNotificationsTable(db: Database): void {
  migrateNotifications(db);
}

/**
 * Create a new notification
 * Returns null if a notification with the same source already exists (deduplication)
 */
export function createNotification(
  db: Database,
  input: CreateNotificationInput,
): Notification | null {
  const id = generateId();
  const metadata = input.metadata ? JSON.stringify(input.metadata) : null;

  try {
    db.prepare(`
      INSERT INTO notifications (
        id, ticket_id, source_type, source_id, priority, 
        summary, content, author, metadata, source_timestamp
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.ticket_id,
      input.source_type,
      input.source_id,
      input.priority,
      input.summary,
      input.content,
      input.author ?? null,
      metadata,
      input.source_timestamp ?? null,
    );

    return getNotificationById(db, id);
  } catch (error) {
    // Check if it's a unique constraint violation (duplicate)
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      return null;
    }
    throw error;
  }
}

/**
 * Get a notification by ID
 */
export function getNotificationById(db: Database, id: string): Notification | null {
  return db.prepare("SELECT * FROM notifications WHERE id = ?").get(id) as Notification | null;
}

/**
 * Get a notification by source type and source ID
 */
export function getNotificationBySource(
  db: Database,
  sourceType: NotificationSourceType,
  sourceId: string,
): Notification | null {
  return db
    .prepare("SELECT * FROM notifications WHERE source_type = ? AND source_id = ?")
    .get(sourceType, sourceId) as Notification | null;
}

/**
 * Get all notifications for a ticket, ordered by priority then created_at
 */
export function getNotificationsByTicket(db: Database, ticketId: string): Notification[] {
  return db
    .prepare(`
      SELECT * FROM notifications 
      WHERE ticket_id = ?
      ORDER BY 
        CASE priority 
          WHEN 'blocking' THEN 0 
          WHEN 'high' THEN 1 
          WHEN 'normal' THEN 2 
          WHEN 'low' THEN 3 
        END,
        created_at DESC
    `)
    .all(ticketId) as Notification[];
}

/**
 * Get unread notifications for a ticket, ordered by priority
 */
export function getUnreadNotifications(db: Database, ticketId: string): Notification[] {
  return db
    .prepare(`
      SELECT * FROM notifications 
      WHERE ticket_id = ? AND status = 'unread'
      ORDER BY 
        CASE priority 
          WHEN 'blocking' THEN 0 
          WHEN 'high' THEN 1 
          WHEN 'normal' THEN 2 
          WHEN 'low' THEN 3 
        END,
        created_at DESC
    `)
    .all(ticketId) as Notification[];
}

/**
 * Mark a notification as read
 */
export function markNotificationRead(db: Database, id: string): void {
  db.prepare(`
    UPDATE notifications 
    SET status = 'read', read_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);
}

/**
 * Mark a notification as acknowledged
 */
export function markNotificationAcknowledged(db: Database, id: string): void {
  db.prepare(`
    UPDATE notifications 
    SET status = 'acknowledged', acknowledged_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);
}

/**
 * Acknowledge multiple notifications at once
 */
export function acknowledgeNotifications(db: Database, ids: string[]): void {
  if (ids.length === 0) return;

  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`
    UPDATE notifications 
    SET status = 'acknowledged', acknowledged_at = CURRENT_TIMESTAMP
    WHERE id IN (${placeholders})
  `).run(...ids);
}

/**
 * Delete a notification
 */
export function deleteNotification(db: Database, id: string): void {
  db.prepare("DELETE FROM notifications WHERE id = ?").run(id);
}
