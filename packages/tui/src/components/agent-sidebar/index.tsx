/**
 * Agent sidebar component - shows list of agents with status.
 */
import { type Accessor, For, Show } from "solid-js";
import type { AgentAdapter, AgentState, IssueStatus } from "workhorse-core";

import { ui } from "../../state/ui";
import { getTheme } from "../../theme.ts";
import {
  formatWorkflowStatus,
  getStatusColor,
  getStatusIcon,
  getStatusText,
  getWorkflowStatusColor,
  getWorkflowStatusIcon,
  truncateModel,
} from "./status-utils.ts";

interface AgentSidebarProps {
  agents: Accessor<AgentAdapter[]>;
  selectedId: Accessor<string | null>;
  selectedIndex: Accessor<number>;
  getState: (issueId: string | null) => AgentState | null;
  getIssueStatus: (issueId: string) => IssueStatus | null;
  onSelect: (agent: AgentAdapter) => void;
  focused?: boolean;
}

const SIDEBAR_WIDTH = 34;

export function AgentSidebar(props: AgentSidebarProps) {
  const theme = getTheme();
  const agents = () => props.agents();
  const selectedId = () => props.selectedId();
  const selectedIndex = () => props.selectedIndex();
  const getState = props.getState;
  const onSelect = props.onSelect;
  const isFocused = () => props.focused ?? !ui.inputMode();

  return (
    <box
      flexDirection="column"
      width={SIDEBAR_WIDTH}
      backgroundColor={theme.colors.background}
    >
      {/* Sidebar header */}
      <box
        backgroundColor={theme.colors.surface}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
        flexDirection="row"
        gap={1}
      >
        <text fg={theme.colors.success}>
          <b>● AGENTS</b>
        </text>
        <text fg={theme.colors.dim}>({agents().length})</text>
      </box>

      {/* Agent list */}
      <box
        flexDirection="column"
        flexGrow={1}
        paddingTop={1}
        overflow="scroll"
        gap={1}
      >
        <For each={agents()}>
          {(agent: AgentAdapter, index) => {
            const isHighlighted = () =>
              isFocused() && index() === selectedIndex();
            const isCurrentAgent = () => agent.issueId === selectedId();
            const state = () => getState(agent.issueId);

            return (
              <box
                onMouseDown={() => onSelect(agent)}
                backgroundColor={
                  isHighlighted() ? theme.colors.selection : undefined
                }
                paddingRight={1}
                paddingTop={0}
                paddingBottom={0}
                flexDirection="row"
              >
                {/* Left border indicator for current agent */}
                <Show when={isCurrentAgent()} fallback={<box width={1} />}>
                  <box width={1} backgroundColor={theme.colors.accent} />
                </Show>
                {/* Content column */}
                <box flexDirection="column" flexGrow={1}>
                  {/* Row 1: Agent ID with selection indicator */}
                  <box flexDirection="row" justifyContent="space-between">
                    <text
                      fg={
                        isHighlighted()
                          ? theme.colors.accent
                          : theme.colors.text
                      }
                    >
                      {isHighlighted() ? "▸ " : "  "}
                      <b>{agent.issueId}</b>
                    </text>
                    <text fg={getStatusColor(state(), theme)}>
                      {getStatusIcon(state())}
                    </text>
                  </box>
                  {/* Row 2: Agent state + workflow status */}
                  <box
                    paddingLeft={2}
                    flexDirection="row"
                    gap={1}
                    flexWrap="no-wrap"
                  >
                    <text fg={getStatusColor(state(), theme)}>
                      {getStatusText(state())}
                    </text>
                    <Show
                      when={(() => {
                        const status =
                          props.getIssueStatus(agent.issueId) ??
                          agent.issue.status;
                        return status ? { status } : null;
                      })()}
                    >
                      {(item: () => { status: IssueStatus }) => (
                        <>
                          <text fg={theme.colors.dim}>·</text>
                          <text
                            fg={getWorkflowStatusColor(item().status, theme)}
                          >
                            {getWorkflowStatusIcon(item().status)}{" "}
                            {formatWorkflowStatus(item().status)}
                          </text>
                        </>
                      )}
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
              </box>
            );
          }}
        </For>
      </box>
    </box>
  );
}
