import { Show } from "solid-js";
import type { Notification } from "@jiratown/core";
import { renderNotification } from "../renderers";
import { theme } from "../theme.ts";

interface NotificationBoxProps {
  notification: Notification;
}

/**
 * Renders a notification in the chat using plugin-registered renderers.
 * Supports both "box" style (with border) and "inline" style (single line).
 */
export function NotificationBox(props: NotificationBoxProps) {
  const rendered = () => renderNotification(props.notification);

  return (
    <Show
      when={rendered().style === "box"}
      fallback={
        // Inline style
        <box flexDirection="row">
          <text>{rendered().icon} </text>
          <text>{rendered().title}</text>
        </box>
      }
    >
      {/* Box style */}
      <box flexDirection="column" borderStyle="rounded" padding={1} marginBottom={1}>
        <box flexDirection="row">
          <text>{rendered().icon} </text>
          <text>
            <b>{rendered().title}</b>
          </text>
        </box>
        <Show when={rendered().subtitle}>
          <text fg={theme.colors.dim}>{rendered().subtitle}</text>
        </Show>
        <Show when={rendered().body}>
          <text>{rendered().body}</text>
        </Show>
      </box>
    </Show>
  );
}
