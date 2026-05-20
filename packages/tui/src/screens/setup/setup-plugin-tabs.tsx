import { For } from "solid-js";

import { getTheme } from "../../theme.ts";
import type { SetupPluginConfig } from "./types.ts";

interface SetupPluginTabsProps {
  plugins: SetupPluginConfig[];
  currentPluginIndex: () => number;
}

export function SetupPluginTabs(props: SetupPluginTabsProps) {
  const theme = getTheme();

  return (
    <box
      flexDirection="row"
      backgroundColor={theme.colors.surface}
      paddingLeft={2}
      paddingRight={2}
      paddingBottom={1}
      gap={2}
    >
      <For each={props.plugins}>
        {(plugin, index) => (
          <box
            backgroundColor={
              index() === props.currentPluginIndex() ? theme.colors.selection : undefined
            }
            paddingLeft={1}
            paddingRight={1}
          >
            <text
              fg={index() === props.currentPluginIndex() ? theme.colors.accent : theme.colors.dim}
            >
              {index() === props.currentPluginIndex() ? "▸ " : "  "}
              <b>{plugin.name}</b>
            </text>
          </box>
        )}
      </For>
    </box>
  );
}
