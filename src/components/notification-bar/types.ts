/**
 * Types for NotificationBar component
 */

import type { Notification } from "../../harness/notifications/types.ts";

/**
 * Props for NotificationBar component
 */
export interface NotificationBarProps {
  /** Notifications to display summary of */
  notifications: Notification[];
  /** Number of unread notifications */
  unreadCount: number;
  /** Whether there are blocking notifications */
  hasBlocking: boolean;
  /** Called when user wants to view notifications */
  onViewAll?: () => void;
}

/**
 * Props for NotificationBadge component
 */
export interface NotificationBadgeProps {
  /** Count to display */
  count: number;
  /** Whether these are blocking */
  isBlocking?: boolean;
}
