/**
 * useNotifications hook - Reactive notification management
 *
 * Provides Solid.js reactive state for notifications with polling support.
 */

import { createSignal, createMemo, onMount, onCleanup } from "solid-js";
import { getDatabase } from "../../lib/db/connection.ts";
import {
  createNotification,
  getNotificationsByTicket,
  getUnreadNotifications,
  markNotificationRead,
  markNotificationAcknowledged,
  acknowledgeNotifications,
  deleteNotification,
} from "../../harness/notifications/notification-store.ts";
import type {
  UseNotificationsOptions,
  UseNotificationsReturn,
  Notification,
  CreateNotificationInput,
  NotificationPriority,
} from "./types.ts";

/**
 * Hook for managing notifications with reactive state
 *
 * @example
 * ```tsx
 * function NotificationList() {
 *   const notifs = useNotifications({
 *     ticketId: 'AM-123',
 *     autoLoad: true,
 *     pollInterval: 5000,
 *   });
 *
 *   return (
 *     <Show when={notifs.hasBlocking()}>
 *       <text>⚠️ {notifs.blockingNotifications().length} blocking</text>
 *     </Show>
 *   );
 * }
 * ```
 */
export function useNotifications(
  options: UseNotificationsOptions = {}
): UseNotificationsReturn {
  const [notifications, setNotifications] = createSignal<Notification[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  const [pollTimer, setPollTimer] = createSignal<Timer | null>(null);

  // Resolve ticketId from options (supports getter function)
  const getTicketId = (): string | undefined => {
    const tid = options.ticketId;
    return typeof tid === "function" ? tid() : tid;
  };

  const handleError = (err: unknown): Error => {
    const e = err instanceof Error ? err : new Error(String(err));
    setError(e);
    options.onError?.(e);
    return e;
  };

  // Derived state
  const unreadCount = createMemo(() => {
    return notifications().filter((n) => n.status === "unread").length;
  });

  const blockingNotifications = createMemo(() => {
    return notifications().filter(
      (n) => n.priority === "blocking" && n.status !== "acknowledged"
    );
  });

  const hasBlocking = createMemo(() => blockingNotifications().length > 0);

  /**
   * Load notifications from database
   */
  const reload = async (): Promise<void> => {
    const ticketId = getTicketId();
    if (!ticketId) {
      setNotifications([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const db = getDatabase();
      const loaded = getNotificationsByTicket(db, ticketId);
      const prevIds = new Set(notifications().map((n) => n.id));

      setNotifications(loaded);
      options.onChange?.(loaded);

      // Check for new notifications
      for (const notif of loaded) {
        if (!prevIds.has(notif.id)) {
          options.onNew?.(notif);
        }
      }
    } catch (err) {
      handleError(err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Create a new notification
   */
  const create = (input: CreateNotificationInput): Notification | null => {
    try {
      setError(null);
      const db = getDatabase();
      const notif = createNotification(db, input);

      if (notif) {
        // Update local state immediately
        setNotifications((prev) => {
          const updated = [notif, ...prev];
          options.onChange?.(updated);
          options.onNew?.(notif);
          return updated;
        });
      }

      return notif;
    } catch (err) {
      handleError(err);
      return null;
    }
  };

  /**
   * Mark notification as read
   */
  const markRead = (id: string): void => {
    try {
      setError(null);
      const db = getDatabase();
      markNotificationRead(db, id);

      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, status: "read" as const } : n
        )
      );
    } catch (err) {
      handleError(err);
    }
  };

  /**
   * Acknowledge notification
   */
  const acknowledge = (id: string): void => {
    try {
      setError(null);
      const db = getDatabase();
      markNotificationAcknowledged(db, id);

      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, status: "acknowledged" as const } : n
        )
      );
    } catch (err) {
      handleError(err);
    }
  };

  /**
   * Acknowledge multiple notifications
   */
  const acknowledgeMany = (ids: string[]): void => {
    if (ids.length === 0) return;

    try {
      setError(null);
      const db = getDatabase();
      acknowledgeNotifications(db, ids);

      const idSet = new Set(ids);
      setNotifications((prev) =>
        prev.map((n) =>
          idSet.has(n.id) ? { ...n, status: "acknowledged" as const } : n
        )
      );
    } catch (err) {
      handleError(err);
    }
  };

  /**
   * Delete notification
   */
  const remove = (id: string): void => {
    try {
      setError(null);
      const db = getDatabase();
      deleteNotification(db, id);

      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      handleError(err);
    }
  };

  /**
   * Get notifications by priority
   */
  const getByPriority = (priority: NotificationPriority): Notification[] => {
    return notifications().filter((n) => n.priority === priority);
  };

  /**
   * Start polling for new notifications
   */
  const startPolling = (): void => {
    const interval = options.pollInterval;
    if (!interval || interval <= 0) return;

    stopPolling();
    const timer = setInterval(() => {
      reload().catch(() => {});
    }, interval);
    setPollTimer(timer);
  };

  /**
   * Stop polling
   */
  const stopPolling = (): void => {
    const timer = pollTimer();
    if (timer) {
      clearInterval(timer);
      setPollTimer(null);
    }
  };

  // Auto-load on mount if enabled
  if (options.autoLoad) {
    onMount(() => {
      reload().catch(() => {});

      // Start polling if interval is set
      if (options.pollInterval && options.pollInterval > 0) {
        startPolling();
      }
    });
  }

  // Cleanup polling on unmount
  onCleanup(() => {
    stopPolling();
  });

  return {
    notifications,
    unreadCount,
    blockingNotifications,
    hasBlocking,
    isLoading,
    error,
    reload,
    create,
    markRead,
    acknowledge,
    acknowledgeMany,
    remove,
    getByPriority,
    startPolling,
    stopPolling,
  };
}
