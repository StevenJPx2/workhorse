/**
 * StatusBadge component for Jiratown TUI
 *
 * Displays a ticket status with consistent styling
 */

import { colors, spacing, getStatusConfig, type StatusConfig } from "../lib/theme.ts";
import type { TicketStatus } from "../types/ticket.ts";

export interface StatusBadgeProps {
  /** The ticket status to display */
  status: TicketStatus;
  /** Whether to show the indicator icon */
  showIndicator?: boolean;
  /** Whether to show the label text */
  showLabel?: boolean;
  /** Whether to use compact mode (no padding) */
  compact?: boolean;
}

/**
 * A badge component that displays ticket status with appropriate styling
 *
 * @example
 * // Full badge with indicator and label
 * <StatusBadge status="implementing" />
 *
 * @example
 * // Indicator only (for tabs)
 * <StatusBadge status="blocked" showLabel={false} />
 *
 * @example
 * // Label only
 * <StatusBadge status="done" showIndicator={false} />
 */
export function StatusBadge(props: StatusBadgeProps) {
  const config = () => getStatusConfig(props.status);
  const showIndicator = () => props.showIndicator ?? true;
  const showLabel = () => props.showLabel ?? true;
  const compact = () => props.compact ?? false;

  return (
    <box
      flexDirection="row"
      paddingLeft={compact() ? 0 : spacing.sm}
      paddingRight={compact() ? 0 : spacing.sm}
      border={!compact()}
      borderStyle="rounded"
      borderColor={config().color}
    >
      {showIndicator() && <text fg={config().color}>{config().indicator}</text>}
      {showIndicator() && showLabel() && <text> </text>}
      {showLabel() && <text fg={config().color}>{config().label}</text>}
    </box>
  );
}

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
