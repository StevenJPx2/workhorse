/**
 * Compact monitor status indicator for the agent screen header.
 * Shows running monitor count, type breakdown, and error state.
 */

import { Show } from "solid-js";
import { getMonitorDisplayInfo } from "../primitives/monitor-display";
import { getTheme } from "../theme";
import type { MonitorsState } from "../primitives/create-monitors";

interface MonitorIndicatorProps {
  state: MonitorsState;
}

export function MonitorIndicator(props: MonitorIndicatorProps) {
  const theme = getTheme();
  const info = () => getMonitorDisplayInfo(props.state);

  return (
    <Show when={info()}>
      {(data: () => NonNullable<ReturnType<typeof getMonitorDisplayInfo>>) => (
        <box flexDirection="row" flexShrink={0}>
          <text fg={data().hasErrors ? theme.colors.error : theme.colors.success}>
            {"●"}
            {"\u00A0"}
          </text>
          <text fg={theme.colors.dim}>
            {data().count}
            {"\u00A0"}
            {data().count === 1 ? "monitor" : "monitors"}
          </text>
          <Show when={data().remoteCount > 0 && data().localCount > 0}>
            <text fg={theme.colors.dim}>
              {"\u00A0"}
              {"("}
              {`${data().remoteCount}r${data().localCount}l`}
              {")"}
            </text>
          </Show>
        </box>
      )}
    </Show>
  );
}
