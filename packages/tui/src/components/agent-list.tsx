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
  const agents = createAgents();
  const theme = getTheme();

  // Check if this component is focused
  const isFocused = () => ui.focusedComponent() === "agents";

  // Handle click to focus this component
  const handleClick = () => {
    ui.setFocusedComponent("agents");
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
      flexGrow={1}
      backgroundColor={theme.colors.background}
      {...({ onClick: handleClick } as any)}
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
            const statusColor = getStatusColor(agent.state);
            const statusIcon = getStatusIcon(agent.state);

            return (
              <box
                backgroundColor={isSelected() ? theme.colors.selection : undefined}
                paddingLeft={2}
                paddingRight={2}
                flexDirection="row"
                justifyContent="space-between"
              >
                <box>
                  <text fg={isSelected() ? theme.colors.accent : theme.colors.text}>
                    {isSelected() ? "▸ " : "  "}
                    <b>{agent.issueId}</b>
                  </text>
                </box>
                <box>
                  <text fg={statusColor}>
                    {statusIcon} {agent.state}
                  </text>
                  <Show when={agent.state === "crashed"}>
                    <text fg={theme.colors.error}> !</text>
                  </Show>
                </box>
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
