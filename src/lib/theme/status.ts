/**
 * Status display configuration for Jiratown TUI
 */

import { colors } from "./colors.ts";
import type { Theme } from "./types.ts";

export interface StatusConfig {
  color: string;
  label: string;
  indicator: string;
}

/** Status indicator characters (theme-independent) */
const STATUS_INDICATORS: Record<string, { label: string; indicator: string }> = {
  pending: { label: "PENDING", indicator: "○" },
  queued: { label: "QUEUED", indicator: "◎" },
  planning: { label: "PLANNING", indicator: "◐" },
  implementing: { label: "IMPLEMENTING", indicator: "▶" },
  blocked: { label: "BLOCKED", indicator: "!" },
  pr_created: { label: "PR CREATED", indicator: "⬆" },
  in_review: { label: "IN REVIEW", indicator: "◉" },
  done: { label: "DONE", indicator: "✓" },
};

/**
 * Build status config using the current theme colors
 */
function buildStatusConfig(theme: Theme): Record<string, StatusConfig> {
  return {
    pending: {
      color: theme.status.pending,
      ...STATUS_INDICATORS.pending,
    },
    queued: {
      color: theme.status.queued,
      ...STATUS_INDICATORS.queued,
    },
    planning: {
      color: theme.status.planning,
      ...STATUS_INDICATORS.planning,
    },
    implementing: {
      color: theme.status.implementing,
      ...STATUS_INDICATORS.implementing,
    },
    blocked: {
      color: theme.status.blocked,
      ...STATUS_INDICATORS.blocked,
    },
    pr_created: {
      color: theme.status.pr_created,
      ...STATUS_INDICATORS.pr_created,
    },
    in_review: {
      color: theme.status.in_review,
      ...STATUS_INDICATORS.in_review,
    },
    done: {
      color: theme.status.done,
      ...STATUS_INDICATORS.done,
    },
  };
}

/** @deprecated Use getStatusConfig with theme parameter instead */
export const statusConfig: Record<string, StatusConfig> = buildStatusConfig(colors);

/**
 * Get status configuration for a given status string
 * @param status - The status string
 * @param theme - Optional theme (defaults to base colors for backwards compatibility)
 */
export function getStatusConfig(status: string, theme?: Theme): StatusConfig {
  const t = theme ?? colors;
  const config = buildStatusConfig(t);
  return (
    config[status] ?? {
      color: t.text.secondary,
      label: status.toUpperCase(),
      indicator: "?",
    }
  );
}

/**
 * Agent state display configuration
 */
export interface AgentStateConfig {
  color: string;
  label: string;
  indicator: string;
}

/** Agent state indicator characters */
const AGENT_STATE_INDICATORS: Record<string, { label: string; indicator: string }> = {
  idle: { label: "Idle", indicator: "○" },
  starting: { label: "Starting", indicator: "◐" },
  running: { label: "Running", indicator: "●" },
  stopping: { label: "Stopping", indicator: "◑" },
  stopped: { label: "Stopped", indicator: "◌" },
  crashed: { label: "Crashed", indicator: "✗" },
};

/**
 * Get agent state configuration for display
 * @param state - Agent state string
 * @param theme - Theme for colors
 */
export function getAgentStateConfig(state: string, theme?: Theme): AgentStateConfig {
  const t = theme ?? colors;
  const indicators = AGENT_STATE_INDICATORS[state] ?? { label: state, indicator: "?" };

  // Map agent states to colors
  const stateColors: Record<string, string> = {
    idle: t.text.dim,
    starting: t.status.queued,
    running: t.status.implementing,
    stopping: t.status.planning,
    stopped: t.text.secondary,
    crashed: t.status.blocked,
  };

  return {
    color: stateColors[state] ?? t.text.secondary,
    ...indicators,
  };
}
