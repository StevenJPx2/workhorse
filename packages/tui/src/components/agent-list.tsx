import type { AgentAdapter } from "@jiratown/core";
import { For, Show } from "solid-js";
import { createAgents } from "../primitives/create-agents.ts";
import { getTheme } from "../theme.ts";
import { ui } from "../state/ui.ts";

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

  // Check if this component is focused
  const isFocused = () => ui.focusedComponent() === "agents";

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
        backgroundColor={isFocused() ? theme.colors.selection : theme.colors.surface}
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
        <For each={agents()}>
          {(agent, index) => {
            // Only show selection highlight if this list is focused
            const isSelected = () => isFocused() && index() === (props.selectedIndex ?? 0);
            const state = () => getState(agent.issueId) ?? "stopped";

            return (
              <box
                backgroundColor={isSelected() ? theme.colors.selection : undefined}
                paddingLeft={2}
                paddingRight={2}
                flexDirection="column"
              >
                <box flexDirection="row" justifyContent="space-between">
                  <text fg={isSelected() ? theme.colors.accent : theme.colors.text}>
                    {isSelected() ? "▸ " : "  "}
                    <b>{agent.issueId}</b>
                  </text>
                  <text fg={getStatusColor(state())}>
                    {getStatusIcon(state())} {state()}
                  </text>
                </box>
                <Show when={agent.model}>
                  <box paddingLeft={2}>
                    <text fg={theme.colors.dim}>{agent.model}</text>
                  </box>
                </Show>
                <Show when={state() === "crashed"}>
                  <text fg={theme.colors.error}> !</text>
                </Show>
              </box>
            );
          }}
        </For>
        {agents().length === 0 && (
          <box paddingLeft={2}>
            <text fg={theme.colors.dim}>No agents running</text>
          </box>
        )}
      </box>
    </box>
  );
}
