import { createSignal, createMemo, onMount, onCleanup } from "solid-js";
import { getDatabase } from "../../lib/db/connection.ts";
import {
  createNotification,
  getNotificationsByTicket,
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
import {
  resolveTicketId,
  handleNotificationError,
  countUnread,
  filterBlocking,
  markReadInList,
  acknowledgeInList,
  acknowledgeManyInList,
  removeFromList,
  filterByPriority,
  findNewNotifications,
} from "./notification-helpers.ts";

export function useNotifications(
  options: UseNotificationsOptions = {}
): UseNotificationsReturn {
  const [notifications, setNotifications] = createSignal<Notification[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  const [pollTimer, setPollTimer] = createSignal<Timer | null>(null);

  const getTicketId = (): string | undefined => resolveTicketId(options);

  const unreadCount = createMemo(() => countUnread(notifications()));
  const blockingNotifications = createMemo(() =>
    filterBlocking(notifications())
  );
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

      const db = getDatabase();
      const loaded = getNotificationsByTicket(db, ticketId);
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
      const db = getDatabase();
      const notif = createNotification(db, input);

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
      const db = getDatabase();
      markNotificationRead(db, id);
      setNotifications((prev) => markReadInList(prev, id));
    } catch (err) {
      handleNotificationError(err, setError, options.onError);
    }
  };

  const acknowledge = (id: string): void => {
    try {
      setError(null);
      const db = getDatabase();
      markNotificationAcknowledged(db, id);
      setNotifications((prev) => acknowledgeInList(prev, id));
    } catch (err) {
      handleNotificationError(err, setError, options.onError);
    }
  };

  const acknowledgeMany = (ids: string[]): void => {
    if (ids.length === 0) return;

    try {
      setError(null);
      const db = getDatabase();
      acknowledgeNotifications(db, ids);
      setNotifications((prev) => acknowledgeManyInList(prev, ids));
    } catch (err) {
      handleNotificationError(err, setError, options.onError);
    }
  };

  const remove = (id: string): void => {
    try {
      setError(null);
      const db = getDatabase();
      deleteNotification(db, id);
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