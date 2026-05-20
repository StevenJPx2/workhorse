import { For, Show } from "solid-js";

import { ui, type Toast as ToastType } from "../state/ui.ts";
import { getTheme } from "../theme.ts";

/** Single toast notification item */
function ToastItem(props: { toast: ToastType }) {
  const theme = getTheme();
  const style = () => {
    switch (props.toast.type) {
      case "error":
        return { icon: "✖", color: theme.colors.error, bg: theme.colors.surface };
      case "success":
        return { icon: "✓", color: theme.colors.success, bg: theme.colors.surface };
      case "warning":
        return { icon: "⚠", color: theme.colors.warning, bg: theme.colors.surface };
      case "info":
      default:
        return { icon: "ℹ", color: theme.colors.info, bg: theme.colors.surface };
    }
  };

  return (
    <box
      flexDirection="row"
      backgroundColor={style().bg}
      borderStyle="rounded"
      borderColor={style().color}
      paddingLeft={1}
      paddingRight={1}
      marginBottom={1}
      width={60}
    >
      <box flexShrink={0}>
        <text fg={style().color}>
          <b>{style().icon}</b>
        </text>
      </box>
      <box flexGrow={1} paddingLeft={1} paddingRight={1}>
        <text fg={theme.colors.text}>{props.toast.message}</text>
      </box>
      <box flexShrink={0}>
        <text fg={theme.colors.dim}>[x]</text>
      </box>
    </box>
  );
}

/** Toast container - displays all active toasts in bottom-right corner */
export function ToastContainer() {
  return (
    <Show when={ui.toasts().length > 0}>
      <box position="absolute" bottom={2} right={2} flexDirection="column" zIndex={2000}>
        <For each={ui.toasts()}>{(toast) => <ToastItem toast={toast} />}</For>
      </box>
    </Show>
  );
}
