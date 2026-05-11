/**
 * Unified activity row component.
 *
 * Renders tool calls and notifications using the plugin-based renderer registry.
 */

import { Show } from "solid-js";
import { render, type ActivityInput } from "../renderers";
import { getTheme } from "../theme.ts";

export function ActivityRow(props: { input: ActivityInput }) {
  const theme = getTheme();
  const rendered = () => render(props.input);

  const color = () => {
    const c = rendered().color;
    if (!c) return theme.colors.text;
    switch (c) {
      case "info":
        return theme.colors.info;
      case "success":
        return theme.colors.success;
      case "warning":
        return theme.colors.warning;
      case "error":
        return theme.colors.error;
      case "dim":
        return theme.colors.dim;
      case "accent":
        return theme.colors.accent;
      default:
        return theme.colors.text;
    }
  };

  return (
    <Show
      when={rendered().style === "box"}
      fallback={
        // Inline style
        <box flexDirection="row" paddingLeft={1} gap={1}>
          <text fg={color()}>{rendered().icon}</text>
          <text fg={theme.colors.dim}>{rendered().title}</text>
          <Show when={rendered().subtitle}>
            <text fg={theme.colors.text}>{rendered().subtitle}</text>
          </Show>
        </box>
      }
    >
      {/* Box style */}
      <box flexDirection="column" marginY={1}>
        <box flexDirection="row" paddingLeft={1} gap={1}>
          <text fg={color()}>{rendered().icon}</text>
          <text fg={color()}>
            <b>{rendered().title}</b>
          </text>
        </box>
        <Show when={rendered().subtitle}>
          <box paddingLeft={3}>
            <text fg={theme.colors.dim}>{rendered().subtitle}</text>
          </box>
        </Show>
        <Show when={rendered().body}>
          <box borderStyle="rounded" borderColor={color()} marginLeft={2} paddingX={1}>
            <text fg={theme.colors.text}>{rendered().body}</text>
          </box>
        </Show>
      </box>
    </Show>
  );
}
