import { For } from "solid-js";
import { getTheme } from "../theme.ts";

interface StatusBarProps {
  shortcuts: Array<{ key: string; action: string }>;
}

/**
 * Bottom status bar showing available keyboard shortcuts.
 * Uses surface background for visual separation.
 */
export function StatusBar(props: StatusBarProps) {
  const theme = getTheme();
  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      backgroundColor={theme.colors.surface}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
    >
      <box flexDirection="row" gap={3}>
        <For each={props.shortcuts}>
          {(shortcut) => (
            <box flexDirection="row">
              <text fg={theme.colors.accent}>
                <b>{shortcut.key}</b>
              </text>
              <text fg={theme.colors.dim}> {shortcut.action}</text>
            </box>
          )}
        </For>
      </box>
      <box flexDirection="row">
        <text fg={theme.colors.error}>
          <b>q</b>
        </text>
        <text fg={theme.colors.dim}> quit</text>
      </box>
    </box>
  );
}
