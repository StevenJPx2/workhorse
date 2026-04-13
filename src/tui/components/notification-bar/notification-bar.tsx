/**
 * NotificationBar component - Footer notification summary
 *
 * Shows a compact summary of notifications in the footer bar:
 * - "No notifications" when empty
 * - "⚠️ 2 blocking" when blocking notifications exist
 * - "3 unread" for normal unread count
 */

import { Show } from "solid-js";
import { useTheme } from "../../theme/index.ts";
import type { NotificationBarProps } from "./types.ts";

/**
 * Compact notification summary for footer
 */
export function NotificationBar(props: NotificationBarProps) {
  const { theme } = useTheme();

  const blockingCount = () =>
    props.notifications.filter((n) => n.priority === "blocking" && n.status !== "acknowledged")
      .length;

  return (
    <box flexDirection="row" gap={1}>
      <Show
        when={props.notifications.length > 0}
        fallback={<text fg={theme().text.dim}>No notifications</text>}
      >
        {/* Blocking notifications indicator */}
        <Show when={blockingCount() > 0}>
          <text fg={theme().status.blocked}>⚠️ {blockingCount()} blocking</text>
        </Show>

        {/* Unread count (only show if no blocking, or in addition to blocking) */}
        <Show when={props.unreadCount > 0 && blockingCount() === 0}>
          <text fg={theme().status.queued}>{props.unreadCount} unread</text>
        </Show>

        {/* If blocking exists but also other unread */}
        <Show when={blockingCount() > 0 && props.unreadCount > blockingCount()}>
          <text fg={theme().text.dim}> | </text>
          <text fg={theme().text.secondary}>+{props.unreadCount - blockingCount()} more</text>
        </Show>
      </Show>
    </box>
  );
}
