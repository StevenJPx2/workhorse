/**
 * Compact monitor status indicator for the agent screen header.
 * Shows running monitor count, type breakdown, and error state.
 */
import { Show } from "solid-js";

import type { MonitorsState } from "../primitives/create-monitors";
import { getMonitorDisplayInfo } from "../primitives/monitor-display";
import { getTheme } from "../theme";

interface MonitorIndicatorProps {
  state: MonitorsState;
}

export function MonitorIndicator(props: MonitorIndicatorProps) {
  const theme = getTheme();
  const info = () => getMonitorDisplayInfo(props.state);

  return (
    <Show when={info()}>
      {(data: () => NonNullable<ReturnType<typeof getMonitorDisplayInfo>>) => (
        <box flexDirection="row" flexShrink={0} gap={1}>
          <text
            fg={data().hasErrors ? theme.colors.error : theme.colors.success}
          >
            {"●"}
          </text>
          <text fg={theme.colors.dim}>
            {data().count} {data().count === 1 ? "monitor" : "monitors"}
          </text>
          <Show when={data().pollingCount > 0 && data().eventCount > 0}>
            <text fg={theme.colors.dim}>
              ({`${data().pollingCount}p${data().eventCount}e`})
            </text>
          </Show>
        </box>
      )}
    </Show>
  );
}
