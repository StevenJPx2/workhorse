/**
 * Agent sidebar component - shows list of agents with status.
 */

import { For, Show, type Accessor } from "solid-js";
import type { AgentAdapter, AgentState } from "workhorse-core";

import { ui } from "../state/ui.ts";
import { getTheme } from "../theme.ts";
import {
  formatWorkflowStatus,
  getStatusColor,
  getStatusIcon,
  getStatusText,
  getWorkflowStatusColor,
  getWorkflowStatusIcon,
  truncateModel,
} from "./agent-status-utils.ts";

interface AgentSidebarProps {
  agents: Accessor<AgentAdapter[]>;
  selectedId: Accessor<string | null>;
  selectedIndex: Accessor<number>;
  getState: (issueId: string | null) => AgentState | null;
  onSelect: (agent: AgentAdapter) => void;
  focused?: boolean;
}

const SIDEBAR_WIDTH = 28;

export function AgentSidebar(props: AgentSidebarProps) {
  const theme = getTheme();
  const agents = () => props.agents();
  const selectedId = () => props.selectedId();
  const selectedIndex = () => props.selectedIndex();
  const getState = props.getState;
  const onSelect = props.onSelect;
  const isFocused = () => props.focused ?? !ui.inputMode();

  return (
    <box flexDirection="column" width={SIDEBAR_WIDTH} backgroundColor={theme.colors.background}>
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
        <text fg={theme.colors.dim}> ({agents().length})</text>
      </box>

      {/* Agent list */}
      <box flexDirection="column" flexGrow={1} paddingTop={1} overflow="scroll">
        <For each={agents()}>
          {(agent: AgentAdapter, index) => {
            const isHighlighted = () => isFocused() && index() === selectedIndex();
            const isCurrentAgent = () => agent.issueId === selectedId();
            const state = () => getState(agent.issueId);

            return (
              <box
                onMouseDown={() => onSelect(agent)}
                backgroundColor={isHighlighted() ? theme.colors.selection : undefined}
                paddingLeft={isCurrentAgent() ? 0 : 1}
                paddingRight={1}
                paddingTop={0}
                paddingBottom={0}
                flexDirection="column"
              >
                {/* Left border indicator for current agent */}
                {isCurrentAgent() && (
                  <box width={1} height="100%" backgroundColor={theme.colors.accent} />
                )}
                {/* Row 1: Agent ID with selection indicator */}
                <box flexDirection="row" justifyContent="space-between">
                  <text fg={isHighlighted() ? theme.colors.accent : theme.colors.text}>
                    {isHighlighted() ? "▸ " : "  "}
                    <b>{agent.issueId}</b>
                  </text>
                  <text fg={getStatusColor(state(), theme)}>{getStatusIcon(state())}</text>
                </box>
                {/* Row 2: Agent state + workflow status */}
                <box paddingLeft={2} flexDirection="row" gap={1}>
                  <text fg={getStatusColor(state(), theme)}>{getStatusText(state())}</text>
                  <Show when={agent.issue.status}>
                    <text fg={theme.colors.dim}>·</text>
                    <text fg={getWorkflowStatusColor(agent.issue.status, theme)}>
                      {getWorkflowStatusIcon(agent.issue.status)}{" "}
                      {formatWorkflowStatus(agent.issue.status)}
                    </text>
                  </Show>
                </box>
                {/* Row 3: Model info */}
                <Show when={agent.model}>
                  <box paddingLeft={2}>
                    <text fg={theme.colors.dim}>
                      {truncateModel(agent.model ?? "", SIDEBAR_WIDTH - 6)}
                    </text>
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
