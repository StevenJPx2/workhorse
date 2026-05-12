/**
 * Agent sidebar component - shows list of agents with status.
 */

import { For, Show, type Accessor } from "solid-js";
import type { AgentAdapter, AgentState } from "workhorse-core";
import { getTheme } from "../theme.ts";

interface AgentSidebarProps {
  agents: Accessor<AgentAdapter[]>;
  selectedId: Accessor<string | null>;
  getState: (issueId: string | null) => AgentState | null;
  onSelect: (agent: AgentAdapter) => void;
}

export function AgentSidebar(props: AgentSidebarProps) {
  const theme = getTheme();
  const agents = () => props.agents();
  const selectedId = () => props.selectedId();
  const getState = props.getState;
  const onSelect = props.onSelect;

  return (
    <box flexDirection="column" width={18} backgroundColor={theme.colors.background}>
      {/* Sidebar header */}
      <box
        backgroundColor={theme.colors.surface}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
      >
        <text fg={theme.colors.success}>
          <b>● AGENTS</b>
        </text>
      </box>

      {/* Agent list */}
      <box flexDirection="column" flexGrow={1} paddingTop={1}>
        <For each={agents()}>
          {(agent: AgentAdapter) => {
            const isSelected = () => agent.issueId === selectedId();

            return (
              <box
                onMouseDown={() => onSelect(agent)}
                backgroundColor={isSelected() ? theme.colors.selection : undefined}
                paddingLeft={1}
                paddingRight={1}
                flexDirection="column"
              >
                <box flexDirection="row" justifyContent="space-between">
                  <text fg={isSelected() ? theme.colors.accent : theme.colors.text}>
                    {isSelected() ? "▸ " : "  "}
                    <b>{agent.issueId}</b>
                  </text>
                  <text fg={getStatusColor(getState(agent.issueId), theme)}>
                    {" "}
                    {getStatusIcon(getState(agent.issueId))}
                  </text>
                </box>
                <Show when={agent.model}>
                  <box paddingLeft={2}>
                    <text fg={theme.colors.dim}>{agent.model}</text>
                  </box>
                </Show>
              </box>
            );
          }}
        </For>
      </box>
    </box>
  );
}

function getStatusColor(state: AgentState | null | undefined, theme: ReturnType<typeof getTheme>) {
  switch (state ?? "stopped") {
    case "running":
    case "starting":
      return theme.colors.success;
    case "crashed":
      return theme.colors.warning;
    case "stopped":
    case "stopping":
      return theme.colors.error;
    default:
      return theme.colors.dim;
  }
}

function getStatusIcon(state: AgentState | null | undefined) {
  switch (state ?? "stopped") {
    case "running":
      return "●";
    case "starting":
      return "◐";
    case "crashed":
      return "⚠";
    case "stopped":
      return "■";
    default:
      return "○";
  }
}
