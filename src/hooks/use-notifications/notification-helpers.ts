import type { UseNotificationsOptions, Notification, NotificationPriority } from "./types.ts";

export function resolveTicketId(options: UseNotificationsOptions): string | undefined {
  const tid = options.ticketId;
  return typeof tid === "function" ? tid() : tid;
}

export function handleNotificationError(
  err: unknown,
  setError: (e: Error | null) => void,
  onError?: (error: Error) => void,
): Error {
  const e = err instanceof Error ? err : new Error(String(err));
  setError(e);
  onError?.(e);
  return e;
}

export function countUnread(notifications: Notification[]): number {
  return notifications.filter((n) => n.status === "unread").length;
}

export function filterBlocking(notifications: Notification[]): Notification[] {
  return notifications.filter((n) => n.priority === "blocking" && n.status !== "acknowledged");
}

export function markReadInList(notifications: Notification[], id: string): Notification[] {
  return notifications.map((n) => (n.id === id ? { ...n, status: "read" as const } : n));
}

export function acknowledgeInList(notifications: Notification[], id: string): Notification[] {
  return notifications.map((n) => (n.id === id ? { ...n, status: "acknowledged" as const } : n));
}

export function acknowledgeManyInList(
  notifications: Notification[],
  ids: string[],
): Notification[] {
  const idSet = new Set(ids);
  return notifications.map((n) =>
    idSet.has(n.id) ? { ...n, status: "acknowledged" as const } : n,
  );
}

export function removeFromList(notifications: Notification[], id: string): Notification[] {
  return notifications.filter((n) => n.id !== id);
}

export function filterByPriority(
  notifications: Notification[],
  priority: NotificationPriority,
): Notification[] {
  return notifications.filter((n) => n.priority === priority);
}

export function findNewNotifications(
  current: Notification[],
  previous: Notification[],
): Notification[] {
  const prevIds = new Set(previous.map((n) => n.id));
  return current.filter((n) => !prevIds.has(n.id));
}
