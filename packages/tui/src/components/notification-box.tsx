import { Show } from "solid-js";
import type { Notification } from "@jiratown/core";
import { renderNotification } from "../renderers";
import { getTheme } from "../theme.ts";

interface NotificationBoxProps {
  notification: Notification;
}

/**
 * Renders a notification in the chat using plugin-registered renderers.
 * Supports both "box" style (with background) and "inline" style (single line).
 */
export function NotificationBox(props: NotificationBoxProps) {
  const rendered = () => renderNotification(props.notification);
  const theme = getTheme();

  return (
    <Show
      when={rendered().style === "box"}
      fallback={
        // Inline style
        <box flexDirection="row" paddingLeft={2}>
          <text fg={theme.colors.accent}>{rendered().icon} </text>
          <text fg={theme.colors.text}>{rendered().title}</text>
        </box>
      }
    >
      {/* Box style */}
      <box flexDirection="column" marginBottom={1}>
        {/* Header */}
        <box backgroundColor={theme.colors.surface} paddingLeft={2} paddingRight={2}>
          <text fg={theme.colors.accent}>{rendered().icon} </text>
          <text fg={theme.colors.text}>
            <b>{rendered().title}</b>
          </text>
        </box>

        {/* Content */}
        <box
          backgroundColor={theme.colors.background}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
        >
          <Show when={rendered().subtitle}>
            <box marginBottom={1}>
              <text fg={theme.colors.dim}>{rendered().subtitle}</text>
            </box>
          </Show>
          <Show when={rendered().body}>
            <text fg={theme.colors.text}>{rendered().body}</text>
          </Show>
        </box>
      </box>
    </Show>
  );
}
