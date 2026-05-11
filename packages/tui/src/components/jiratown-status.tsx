/**
 * Component to display the Jiratown workflow status (planning, implementing, etc.)
 */

import { Show } from "solid-js";
import type { IssueStatus } from "@jiratown/core";
import { getTheme } from "../theme.ts";

interface JiratownStatusProps {
  status: IssueStatus | null;
  compact?: boolean;
}

/** Get display color for a Jiratown status */
function getStatusColor(status: IssueStatus | null, theme: ReturnType<typeof getTheme>): string {
  switch (status) {
    case "planning":
      return theme.colors.info;
    case "implementing":
      return theme.colors.success;
    case "in_review":
      return theme.colors.accent;
    case "blocked":
      return theme.colors.error;
    case "done":
      return theme.colors.success;
    case "pending":
    case "queued":
    default:
      return theme.colors.dim;
  }
}

/** Get icon for a Jiratown status */
function getStatusIcon(status: IssueStatus | null): string {
  switch (status) {
    case "planning":
      return "📋";
    case "implementing":
      return "⚡";
    case "in_review":
      return "👀";
    case "blocked":
      return "🚫";
    case "done":
      return "✅";
    case "queued":
      return "⏳";
    case "pending":
    default:
      return "○";
  }
}

/** Format status for display */
function formatStatus(status: IssueStatus | null): string {
  if (!status) return "—";
  return status.replace(/_/g, " ");
}

/**
 * Displays the Jiratown workflow status with icon and color.
 */
export function JiratownStatus(props: JiratownStatusProps) {
  const theme = getTheme();

  return (
    <Show when={props.status} fallback={<text fg={theme.colors.dim}>—</text>}>
      <text fg={getStatusColor(props.status, theme)}>
        {props.compact ? "" : getStatusIcon(props.status) + " "}
        {formatStatus(props.status)}
      </text>
    </Show>
  );
}
