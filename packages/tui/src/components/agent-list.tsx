import type { AgentAdapter } from "@jiratown/core";
import { createAgents } from "../primitives/create-agents.ts";
import { theme } from "../theme.ts";

interface AgentListProps {
  onSelect: (agent: AgentAdapter) => void;
}

/**
 * Gets status indicator for an agent state.
 */
function getStatusIndicator(state: string): { icon: string; color: string } {
  switch (state) {
    case "running":
      return theme.status.running;
    case "starting":
      return theme.status.running; // Use running indicator for starting
    case "stopping":
    case "stopped":
      return theme.status.stopped;
    case "crashed":
      return theme.status.blocked; // Use blocked indicator for crashed
    default:
      return theme.status.idle;
  }
}

/**
 * Displays running agents with their status.
 */
export function AgentList(props: AgentListProps) {
  const agents = createAgents();

  const options = () =>
    agents().map((agent) => {
      const status = getStatusIndicator(agent.state);
      const crashed = agent.state === "crashed" ? " ⚠ crashed" : "";

      return {
        name: `${agent.issueId} ${status.icon}${crashed}`,
        value: agent,
      };
    });

  const handleSelect = (_index: number, option: { value: AgentAdapter }) => {
    props.onSelect(option.value);
  };

  return (
    <box flexDirection="column" flexGrow={1}>
      <text>
        <b>AGENTS</b>
      </text>
      <select
        options={options()}
        onItemSelected={handleSelect}
        selectedBackgroundColor={theme.colors.selection}
      />
    </box>
  );
}
