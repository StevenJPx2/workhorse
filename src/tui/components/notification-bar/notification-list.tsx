/**
 * NotificationList component - Full notification list dialog
 *
 * Shows all notifications in a scrollable list with:
 * - Priority indicator
 * - Summary and time
 * - Actions to acknowledge/dismiss
 */

import { For, Show, createMemo } from "solid-js";
import { useTheme, spacing } from "../../theme/index.ts";
import { Dialog } from "../dialog/index.ts";
import { Button } from "../button/index.ts";
import type { Notification } from "#core/notifications/types.ts";

export interface NotificationListProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** All notifications to display */
  notifications: Notification[];
  /** Called when user closes the list */
  onClose: () => void;
  /** Called when user acknowledges a notification */
  onAcknowledge?: (notificationId: string) => void;
  /** Called when user acknowledges all notifications */
  onAcknowledgeAll?: () => void;
}

/**
 * Get priority indicator and color
 */
function getPriorityDisplay(priority: string, theme: ReturnType<typeof useTheme>["theme"]) {
  switch (priority) {
    case "blocking":
      return { icon: "⚠️", color: theme().status.blocked, label: "BLOCKING" };
    case "high":
      return { icon: "❗", color: theme().error, label: "HIGH" };
    case "normal":
      return { icon: "●", color: theme().text.secondary, label: "" };
    case "low":
      return { icon: "○", color: theme().text.dim, label: "" };
    default:
      return { icon: "●", color: theme().text.secondary, label: "" };
  }
}

/**
 * Format notification time
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Single notification item
 */
function NotificationItem(props: {
  notification: Notification;
  onAcknowledge?: (id: string) => void;
}) {
  const { theme } = useTheme();
  const priority = () => getPriorityDisplay(props.notification.priority, theme);
  const isUnread = () => props.notification.status === "unread";

  return (
    <box
      flexDirection="row"
      gap={spacing.sm}
      padding={spacing.sm}
      backgroundColor={isUnread() ? theme().bg.highlight : undefined}
    >
      {/* Priority indicator */}
      <text fg={priority().color}>{priority().icon}</text>

      {/* Content */}
      <box flexDirection="column" flexGrow={1} gap={0}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={isUnread() ? theme().text.primary : theme().text.secondary}>
            {props.notification.summary}
          </text>
          <text fg={theme().text.dim}>{formatTime(props.notification.created_at)}</text>
        </box>

        <Show when={priority().label}>
          <text fg={priority().color}>[{priority().label}]</text>
        </Show>

        <Show when={props.notification.author}>
          <text fg={theme().text.dim}>from: {props.notification.author}</text>
        </Show>
      </box>

      {/* Acknowledge button for unread */}
      <Show when={isUnread() && props.onAcknowledge}>
        <Button
          label="✓"
          size="sm"
          style="ghost"
          onPress={() => props.onAcknowledge?.(props.notification.id)}
        />
      </Show>
    </box>
  );
}

/**
 * Full notification list modal
 */
export function NotificationList(props: NotificationListProps) {
  const { theme } = useTheme();

  // Sort notifications: blocking first, then by time
  const sortedNotifications = createMemo(() => {
    return [...props.notifications].sort((a, b) => {
      // Blocking first
      if (a.priority === "blocking" && b.priority !== "blocking") return -1;
      if (b.priority === "blocking" && a.priority !== "blocking") return 1;
      // High priority next
      if (a.priority === "high" && b.priority !== "high") return -1;
      if (b.priority === "high" && a.priority !== "high") return 1;
      // Then by time (newest first)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  });

  const unreadCount = createMemo(
    () => props.notifications.filter((n) => n.status === "unread").length,
  );

  const hasNotifications = () => props.notifications.length > 0;

  return (
    <Dialog
      isOpen={props.isOpen}
      onClose={props.onClose}
      lockId="notification-list"
      title="Notifications"
      width={60}
      height={20}
      hint="[Esc] close"
    >
      <box flexDirection="column" gap={spacing.sm} flexGrow={1}>
        {/* Header with counts */}
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme().text.secondary}>
            {props.notifications.length} notification{props.notifications.length !== 1 ? "s" : ""}
            {unreadCount() > 0 && ` (${unreadCount()} unread)`}
          </text>
          <Show when={unreadCount() > 0 && props.onAcknowledgeAll}>
            <Button
              label="Acknowledge All"
              size="sm"
              style="ghost"
              onPress={props.onAcknowledgeAll}
            />
          </Show>
        </box>

        {/* Notification list */}
        <Show
          when={hasNotifications()}
          fallback={
            <box padding={spacing.md}>
              <text fg={theme().text.dim}>No notifications</text>
            </box>
          }
        >
          <box flexDirection="column" flexGrow={1}>
            <For each={sortedNotifications()}>
              {(notification) => (
                <NotificationItem notification={notification} onAcknowledge={props.onAcknowledge} />
              )}
            </For>
          </box>
        </Show>
      </box>
    </Dialog>
  );
}
