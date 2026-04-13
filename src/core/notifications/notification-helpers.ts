/**
 * Notification list helpers - Pure functions for manipulating notification lists
 *
 * These are pure functions with no UI or database dependencies.
 * They operate on in-memory arrays and return new arrays.
 */

import type { Notification, NotificationPriority } from "./types.ts";

/**
 * Count unread notifications
 */
export function countUnread(notifications: Notification[]): number {
  return notifications.filter((n) => n.status === "unread").length;
}

/**
 * Filter to blocking notifications that haven't been acknowledged
 */
export function filterBlocking(notifications: Notification[]): Notification[] {
  return notifications.filter((n) => n.priority === "blocking" && n.status !== "acknowledged");
}

/**
 * Mark a notification as read in a list (returns new array)
 */
export function markReadInList(notifications: Notification[], id: string): Notification[] {
  return notifications.map((n) => (n.id === id ? { ...n, status: "read" as const } : n));
}

/**
 * Acknowledge a notification in a list (returns new array)
 */
export function acknowledgeInList(notifications: Notification[], id: string): Notification[] {
  return notifications.map((n) => (n.id === id ? { ...n, status: "acknowledged" as const } : n));
}

/**
 * Acknowledge multiple notifications in a list (returns new array)
 */
export function acknowledgeManyInList(
  notifications: Notification[],
  ids: string[],
): Notification[] {
  const idSet = new Set(ids);
  return notifications.map((n) =>
    idSet.has(n.id) ? { ...n, status: "acknowledged" as const } : n,
  );
}

/**
 * Remove a notification from a list (returns new array)
 */
export function removeFromList(notifications: Notification[], id: string): Notification[] {
  return notifications.filter((n) => n.id !== id);
}

/**
 * Filter notifications by priority
 */
export function filterByPriority(
  notifications: Notification[],
  priority: NotificationPriority,
): Notification[] {
  return notifications.filter((n) => n.priority === priority);
}

/**
 * Find notifications that are new (not in previous list)
 */
export function findNewNotifications(
  current: Notification[],
  previous: Notification[],
): Notification[] {
  const prevIds = new Set(previous.map((n) => n.id));
  return current.filter((n) => !prevIds.has(n.id));
}
