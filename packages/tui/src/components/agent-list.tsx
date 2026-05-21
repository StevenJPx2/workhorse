import { createMemo, For, Show } from "solid-js";
import type { AgentAdapter } from "workhorse-core";

import { createAgents } from "../primitives/create-agents.ts";
import { createIssueStatuses } from "../primitives/create-issue-statuses.ts";
import { ui } from "../state/ui";
import { getTheme } from "../theme.ts";
import { Spinner } from "./spinner.tsx";
import { WorkhorseStatus } from "./workhorse-status.tsx";

interface AgentListProps {
  onSelect: (agent: AgentAdapter) => void;
  selectedIndex?: number;
}

/**
 * Displays running agents with their status.
 * Uses background colors for visual hierarchy.
 * Click to focus, Tab to navigate between components.
 */
export function AgentList(props: AgentListProps) {
  const { agents, getState } = createAgents();
  const theme = getTheme();

  // Track issue statuses for all agents
  const { getStatus } = createIssueStatuses({
    issueIds: createMemo(() => agents().map((a) => a.issue.externalId)),
  });

  // Check if this component is focused
  const isFocused = () => ui.focusedComponent() === "agents";

  // Get spawning issues that don't already have an agent (avoid duplicate display)
  const spawningIssues = () => {
    const agentIds = new Set(agents().map((a) => a.issueId));
    return Array.from(ui.spawningIssues().values()).filter(
      (issue) => !agentIds.has(issue.externalId),
    );
  };

  const getStatusColor = (state: string) => {
    switch (state) {
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
  };

  const getStatusIcon = (state: string) => {
    switch (state) {
      case "running":
        return "●";
      case "starting":
        return "◐";
      case "crashed":
        return "⚠";
      case "stopped":
        return "■";
      case "stopping":
        return "◌";
      default:
        return "○";
    }
  };

  return (
    <box
      flexDirection="column"
      width="50%"
      backgroundColor={theme.colors.background}
      onMouseDown={() => ui.setFocusedComponent("agents")}
    >
      {/* Header - highlighted when focused */}
      <box
        backgroundColor={
          isFocused() ? theme.colors.selection : theme.colors.surface
        }
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
      >
        <text fg={theme.colors.success}>
          <b>● AGENTS</b>
        </text>
        <text fg={theme.colors.dim}> ({agents().length} active)</text>
      </box>

      {/* Agent list */}
      <box flexDirection="column" flexGrow={1} paddingTop={1}>
        {/* Spawning agents */}
        <For each={spawningIssues()}>
          {(issue) => (
            <box paddingLeft={2} paddingRight={2} flexDirection="column">
              <box flexDirection="row" justifyContent="space-between">
                <text fg={theme.colors.dim}>
                  {"  "}
                  <b>{issue.externalId}</b>
                </text>
                <box flexDirection="row" gap={1}>
                  <Spinner color={theme.colors.warning} />
                  <text fg={theme.colors.warning}>spawning</text>
                </box>
              </box>
              <box paddingLeft={2}>
                <text fg={theme.colors.dim}>{issue.title}</text>
              </box>
            </box>
          )}
        </For>

        {/* Active agents */}
        <For each={agents()}>
          {(agent, index) => {
            // Only show selection highlight if this list is focused
            const isSelected = () =>
              isFocused() && index() === (props.selectedIndex ?? 0);
            const state = () => getState(agent.issueId) ?? "stopped";

            return (
              <box
                backgroundColor={
                  isSelected() ? theme.colors.selection : undefined
                }
                paddingLeft={2}
                paddingRight={2}
                flexDirection="column"
              >
                <box flexDirection="row" justifyContent="space-between">
                  <text
                    fg={isSelected() ? theme.colors.accent : theme.colors.text}
                  >
                    {isSelected() ? "▸ " : "  "}
                    <b>{agent.issueId}</b>
                  </text>
                  <text fg={getStatusColor(state())}>
                    {getStatusIcon(state())} {state()}
                  </text>
                </box>
                <box paddingLeft={2} flexDirection="row">
                  <WorkhorseStatus
                    status={getStatus(agent.issue.externalId)}
                    compact
                  />
                  <Show when={agent.model}>
                    <text fg={theme.colors.dim}>
                      {" · "}
                      {agent.model}
                    </text>
                  </Show>
                </box>
                <Show when={state() === "crashed"}>
                  <text fg={theme.colors.error}> !</text>
                </Show>
              </box>
            );
          }}
        </For>
        {agents().length === 0 && spawningIssues().length === 0 && (
          <box paddingLeft={2}>
            <text fg={theme.colors.dim}>No agents running</text>
          </box>
        )}
      </box>
    </box>
  );
}
