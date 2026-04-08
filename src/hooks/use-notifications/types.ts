/**
 * Types for useNotifications hook
 */

import type { Accessor } from "solid-js";
import type {
  Notification,
  CreateNotificationInput,
  NotificationPriority,
} from "../../harness/notifications/types.ts";

/**
 * Options for useNotifications hook
 */
export interface UseNotificationsOptions {
  /** Ticket ID to filter notifications */
  ticketId?: string | (() => string | undefined);

  /** Auto-load notifications on mount */
  autoLoad?: boolean;

  /** Poll interval in ms (0 = no polling) */
  pollInterval?: number;

  /** Callback when notifications change */
  onChange?: (notifications: Notification[]) => void;

  /** Callback on error */
  onError?: (error: Error) => void;

  /** Callback when a new notification arrives */
  onNew?: (notification: Notification) => void;
}

/**
 * Return type for useNotifications hook
 */
export interface UseNotificationsReturn {
  /** All notifications (reactive) */
  notifications: Accessor<Notification[]>;

  /** Unread notifications count */
  unreadCount: Accessor<number>;

  /** Blocking notifications (need immediate attention) */
  blockingNotifications: Accessor<Notification[]>;

  /** Has any blocking notification */
  hasBlocking: Accessor<boolean>;

  /** Loading state */
  isLoading: Accessor<boolean>;

  /** Error state */
  error: Accessor<Error | null>;

  /** Reload notifications */
  reload: () => Promise<void>;

  /** Create a new notification */
  create: (input: CreateNotificationInput) => Notification | null;

  /** Mark notification as read */
  markRead: (id: string) => void;

  /** Acknowledge notification (agent has handled it) */
  acknowledge: (id: string) => void;

  /** Acknowledge multiple notifications */
  acknowledgeMany: (ids: string[]) => void;

  /** Delete notification */
  remove: (id: string) => void;

  /** Get notifications by priority */
  getByPriority: (priority: NotificationPriority) => Notification[];

  /** Start polling */
  startPolling: () => void;

  /** Stop polling */
  stopPolling: () => void;
}

export type { Notification, CreateNotificationInput, NotificationPriority };
