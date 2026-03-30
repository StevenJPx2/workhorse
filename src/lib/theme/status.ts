/**
 * Status display configuration for Jiratown TUI
 */

import { colors } from "./colors.ts";

export interface StatusConfig {
  color: string;
  label: string;
  indicator: string;
}

export const statusConfig: Record<string, StatusConfig> = {
  pending: {
    color: colors.status.pending,
    label: "PENDING",
    indicator: "○",
  },
  queued: {
    color: colors.status.queued,
    label: "QUEUED",
    indicator: "◎",
  },
  planning: {
    color: colors.status.planning,
    label: "PLANNING",
    indicator: "◐",
  },
  implementing: {
    color: colors.status.implementing,
    label: "IMPLEMENTING",
    indicator: "▶",
  },
  blocked: {
    color: colors.status.blocked,
    label: "BLOCKED",
    indicator: "!",
  },
  pr_created: {
    color: colors.status.pr_created,
    label: "PR CREATED",
    indicator: "⬆",
  },
  in_review: {
    color: colors.status.in_review,
    label: "IN REVIEW",
    indicator: "◉",
  },
  done: {
    color: colors.status.done,
    label: "DONE",
    indicator: "✓",
  },
};

/**
 * Get status configuration for a given status string
 */
export function getStatusConfig(status: string): StatusConfig {
  return (
    statusConfig[status] ?? {
      color: colors.text.secondary,
      label: status.toUpperCase(),
      indicator: "?",
    }
  );
}
