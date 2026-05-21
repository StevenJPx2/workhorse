import { For } from "solid-js";
import type { AdapterInfo } from "workhorse-core";

import { getTheme } from "../../theme.ts";

interface HarnessListProps {
  options: AdapterInfo[];
  selectedIndex: number;
  height: number;
}

/** Scrollable list of harness options for agent spawning. */
export function HarnessList(props: HarnessListProps) {
  const theme = getTheme();

  return (
    <scrollbox height={props.height}>
      <box flexDirection="column">
        <For each={props.options}>
          {(option, index) => {
            const isSelected = () => index() === props.selectedIndex;
            return (
              <box
                backgroundColor={
                  isSelected() ? theme.colors.selection : undefined
                }
                paddingLeft={1}
                paddingRight={1}
              >
                <text
                  fg={isSelected() ? theme.colors.success : theme.colors.dim}
                >
                  {isSelected() ? "● " : "○ "}
                  {option.icon} {option.displayName}
                </text>
              </box>
            );
          }}
        </For>
      </box>
    </scrollbox>
  );
}
