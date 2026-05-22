/**
 * Activity feed component - shows agent activity (tool calls, text, file edits).
 * Displays items in a scrollable list with visual distinction by type.
 */
import { type Accessor, For, Show } from "solid-js";

import type { ActivityState } from "../state/activity-store.ts";
import { ui } from "../state/ui";
import { getTheme } from "../theme.ts";
import { ActivityItemRow } from "./activity-rows.tsx";

interface ActivityFeedProps {
  state: Accessor<ActivityState>;
  /** Max height in rows (default: fills available space) */
  maxHeight?: number;
}

/** Activity feed showing tool calls, text output, and file edits. */
export function ActivityFeed(props: ActivityFeedProps) {
  return (
    <box flexDirection="column" flexGrow={1} paddingTop={1}>
      <scrollbox
        flexGrow={1}
        stickyScroll
        stickyStart="bottom"
        focused={!ui.modal() && ui.focusedComponent() !== "chat"}
      >
        <box flexDirection="column" gap={1}>
          <For each={props.state().items}>
            {(item) => <ActivityItemRow item={item} />}
          </For>
          <Show when={props.state().isStreaming}>
            <box paddingLeft={1}>
              <text fg={getTheme().colors.dim}>
                <i>● thinking...</i>
              </text>
            </box>
          </Show>
        </box>
      </scrollbox>
    </box>
  );
}
