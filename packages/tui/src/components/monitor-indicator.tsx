/**
 * Compact monitor status indicator for the agent screen header.
 * Shows running monitor count, type breakdown, and error state.
 */

import { Show } from "solid-js";
import type { MonitorsState } from "../primitives/create-monitors";
import { getTheme } from "../theme";

interface MonitorIndicatorProps {
  state: MonitorsState;
}

export function MonitorIndicator(props: MonitorIndicatorProps) {
  const theme = getTheme();
  const count = () => props.state.monitors.length;
  const hasErrors = () => props.state.monitors.some((m) => m.state === "error" || m.errorCount > 0);
  const remoteCount = () => props.state.monitors.filter((m) => m.type === "remote").length;
  const localCount = () => props.state.monitors.filter((m) => m.type === "local").length;

  return (
    <Show when={count() > 0}>
      <box flexDirection="row" flexShrink={0}>
        <text fg={hasErrors() ? theme.colors.error : theme.colors.success}>
          {"●"}
          {"\u00A0"}
        </text>
        <text fg={theme.colors.dim}>
          {count()}
          {"\u00A0"}
          {count() === 1 ? "monitor" : "monitors"}
        </text>
        <Show when={remoteCount() > 0 && localCount() > 0}>
          <text fg={theme.colors.dim}>
            {"\u00A0"}
            {"("}
            {remoteCount() > 0 && `${remoteCount()}r`}
            {localCount() > 0 && `${localCount()}l`}
            {")"}
          </text>
        </Show>
      </box>
    </Show>
  );
}
