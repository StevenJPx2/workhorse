import { For } from "solid-js";
import { theme } from "../theme.ts";

interface StatusBarProps {
  shortcuts: Array<{ key: string; action: string }>;
}

/**
 * Bottom status bar showing available keyboard shortcuts.
 */
export function StatusBar(props: StatusBarProps) {
  return (
    <box flexDirection="row" justifyContent="space-between" borderStyle="single" padding={1}>
      <box flexDirection="row" gap={2}>
        <For each={props.shortcuts}>
          {(shortcut) => (
            <box flexDirection="row">
              <text>
                <b>[{shortcut.key}]</b>
              </text>
              <text fg={theme.colors.dim}>{shortcut.action}</text>
            </box>
          )}
        </For>
      </box>
      <text fg={theme.colors.dim}>q:quit</text>
    </box>
  );
}
