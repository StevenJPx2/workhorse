/**
 * AgentBadge component for Jiratown TUI
 */

import { colors, spacing } from "../../lib/theme/index.ts";

export interface AgentBadgeProps {
  /** The agent type */
  agent: "opencode" | "claude" | string;
  /** Whether to use compact mode */
  compact?: boolean;
}

/**
 * A badge component that displays agent type with appropriate styling
 *
 * @example
 * <AgentBadge agent="opencode" />
 */
export function AgentBadge(props: AgentBadgeProps) {
  const agentColor = () => {
    if (props.agent === "claude") {
      return colors.agent.claude;
    }
    return colors.agent.opencode;
  };

  const agentLabel = () => {
    if (props.agent === "claude") {
      return "Claude";
    }
    if (props.agent === "opencode") {
      return "OpenCode";
    }
    return props.agent;
  };

  const compact = () => props.compact ?? false;

  return (
    <box
      flexDirection="row"
      paddingLeft={compact() ? 0 : spacing.sm}
      paddingRight={compact() ? 0 : spacing.sm}
      border={!compact()}
      borderStyle="rounded"
      borderColor={agentColor()}
    >
      <text fg={agentColor()}>{agentLabel()}</text>
    </box>
  );
}
