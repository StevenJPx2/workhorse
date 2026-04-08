/**
 * EmptyState component - Shown when no tickets are selected
 */

import { Show } from "solid-js";
import { useTheme } from "../lib/theme/index.ts";

export interface EmptyStateProps {
  showAll: boolean;
  rig: string | null;
}

export function EmptyState(props: EmptyStateProps) {
  const { theme } = useTheme();

  return (
    <box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      flexGrow={1}
    >
      <text fg={theme().text.secondary}>No tickets</text>
      <box height={1} />
      <text fg={theme().text.dim}>Press [+] or [n] to add a ticket</text>
      <Show when={!props.showAll && props.rig}>
        <box height={1} />
        <text fg={theme().text.dim}>
          <em>Showing tickets for: {props.rig}</em>
        </text>
      </Show>
    </box>
  );
}
