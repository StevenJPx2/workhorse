/* oxlint-disable max-lines-per-file */

import { createSignal, createMemo, onMount, onCleanup } from "solid-js";
import { getDatabase } from "#core/db/connection.ts";
import {
  createNotification,
  getNotificationsByTicket,
  markNotificationRead,
  markNotificationAcknowledged,
  acknowledgeNotifications,
  deleteNotification,
} from "#core/notifications/notification-store.ts";
import type {
  UseNotificationsOptions,
  UseNotificationsReturn,
  Notification,
  CreateNotificationInput,
  NotificationPriority,
  UseNotificationsDeps,
} from "./types.ts";
import {
  countUnread,
  filterBlocking,
  markReadInList,
  acknowledgeInList,
  acknowledgeManyInList,
  removeFromList,
  filterByPriority,
  findNewNotifications,
} from "#core/notifications/index.ts";
import { resolveTicketId, handleNotificationError } from "./notification-helpers.ts";

const defaultDeps: UseNotificationsDeps = {
  getDatabase,
  getNotificationsByTicket,
  createNotification,
  markNotificationRead,
  markNotificationAcknowledged,
  acknowledgeNotifications,
  deleteNotification,
};

export function useNotifications(
  options: UseNotificationsOptions = {},
  deps: UseNotificationsDeps = defaultDeps,
): UseNotificationsReturn {
  const [notifications, setNotifications] = createSignal<Notification[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  const [pollTimer, setPollTimer] = createSignal<Timer | null>(null);

  const getTicketId = (): string | undefined => resolveTicketId(options);

  const unreadCount = createMemo(() => countUnread(notifications()));
  const blockingNotifications = createMemo(() => filterBlocking(notifications()));
  const hasBlocking = createMemo(() => blockingNotifications().length > 0);

  const reload = async (): Promise<void> => {
    const ticketId = getTicketId();
    if (!ticketId) {
      setNotifications([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const db = deps.getDatabase();
      const loaded = deps.getNotificationsByTicket(db, ticketId);
      const prev = notifications();

      setNotifications(loaded);
      options.onChange?.(loaded);

      for (const notif of findNewNotifications(loaded, prev)) {
        options.onNew?.(notif);
      }
    } catch (err) {
      handleNotificationError(err, setError, options.onError);
    } finally {
      setIsLoading(false);
    }
  };

  const create = (input: CreateNotificationInput): Notification | null => {
    try {
      setError(null);
      const db = deps.getDatabase();
      const notif = deps.createNotification(db, input);

      if (notif) {
        setNotifications((prev) => {
          const updated = [notif, ...prev];
          options.onChange?.(updated);
          options.onNew?.(notif);
          return updated;
        });
      }

      return notif;
    } catch (err) {
      handleNotificationError(err, setError, options.onError);
      return null;
    }
  };

  const markRead = (id: string): void => {
    try {
      setError(null);
      const db = deps.getDatabase();
      deps.markNotificationRead(db, id);
      setNotifications((prev) => markReadInList(prev, id));
    } catch (err) {
      handleNotificationError(err, setError, options.onError);
    }
  };

  const acknowledge = (id: string): void => {
    try {
      setError(null);
      const db = deps.getDatabase();
      deps.markNotificationAcknowledged(db, id);
      setNotifications((prev) => acknowledgeInList(prev, id));
    } catch (err) {
      handleNotificationError(err, setError, options.onError);
    }
  };

  const acknowledgeMany = (ids: string[]): void => {
    if (ids.length === 0) return;

    try {
      setError(null);
      const db = deps.getDatabase();
      deps.acknowledgeNotifications(db, ids);
      setNotifications((prev) => acknowledgeManyInList(prev, ids));
    } catch (err) {
      handleNotificationError(err, setError, options.onError);
    }
  };

  const remove = (id: string): void => {
    try {
      setError(null);
      const db = deps.getDatabase();
      deps.deleteNotification(db, id);
      setNotifications((prev) => removeFromList(prev, id));
    } catch (err) {
      handleNotificationError(err, setError, options.onError);
    }
  };

  const getByPriority = (priority: NotificationPriority): Notification[] => {
    return filterByPriority(notifications(), priority);
  };

  const startPolling = (): void => {
    const interval = options.pollInterval;
    if (!interval || interval <= 0) return;

    stopPolling();
    const timer = setInterval(() => {
      reload().catch(() => {});
    }, interval);
    setPollTimer(timer);
  };

  const stopPolling = (): void => {
    const timer = pollTimer();
    if (timer) {
      clearInterval(timer);
      setPollTimer(null);
    }
  };

  if (options.autoLoad) {
    onMount(() => {
      reload().catch(() => {});

      if (options.pollInterval && options.pollInterval > 0) {
        startPolling();
      }
    });
  }

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
