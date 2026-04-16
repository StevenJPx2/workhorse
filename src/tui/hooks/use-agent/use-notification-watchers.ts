/**
 * Notification watcher management for useAgent hook
 *
 * Manages per-agent notification watchers that inject notifications into agent conversations.
 */

import { createNotificationWatcher } from "#core/pollers/notification-watcher.ts";
import type { Poller, NotificationWatcherResult } from "#core/pollers/index.ts";
import type { Notification } from "#core/notifications/types.ts";
import { getDatabase } from "#core/db/connection.ts";

/** Default interval for notification watcher (5 seconds) */
export const NOTIFICATION_WATCH_INTERVAL = 5000;

export interface NotificationWatcherCallbacks {
  /** Called when notifications are injected into an agent */
  onNotificationsInjected?: (ticketId: string, notifications: Notification[]) => void;
}

export interface NotificationWatcherManager {
  start: (ticketId: string) => void;
  stop: (ticketId: string) => void;
  stopAll: () => void;
}

/**
 * Create a manager for per-agent notification watchers
 */
export function createNotificationWatcherManager(
  interval: number,
  callbacks: NotificationWatcherCallbacks,
): NotificationWatcherManager {
  const watchers = new Map<string, Poller<NotificationWatcherResult>>();

  const start = (ticketId: string): void => {
    if (watchers.has(ticketId)) return;

    try {
      const db = getDatabase();
      const watcher = createNotificationWatcher({
        db,
        ticketId,
        interval,
        autoStart: true,
        onNotificationsInjected: (notifications) => {
          callbacks.onNotificationsInjected?.(ticketId, notifications);
        },
        onError: (err) => {
          console.error(`[NotificationWatcher] Error for ${ticketId}:`, err.message);
        },
      });
      watchers.set(ticketId, watcher);
    } catch (err) {
      console.error(`[NotificationWatcher] Failed to start for ${ticketId}:`, err);
    }
  };

  const stop = (ticketId: string): void => {
    const watcher = watchers.get(ticketId);
    if (watcher) {
      watcher.stop();
      watchers.delete(ticketId);
    }
  };

  const stopAll = (): void => {
    for (const [, watcher] of watchers) {
      watcher.stop();
    }
    watchers.clear();
  };

  return { start, stop, stopAll };
}
