/**
 * Component to display the Jiratown workflow status (planning, implementing, etc.)
 */

import { Show } from "solid-js";
import type { IssueStatus } from "@stevenjpx2/jiratown-core";
import { getTheme } from "../theme.ts";

interface JiratownStatusProps {
  status: IssueStatus | null;
  compact?: boolean;
}

/**
 * Displays the Jiratown workflow status with icon and color.
 */
export function JiratownStatus(props: JiratownStatusProps) {
  const theme = getTheme();

  const getStatusColor = (status: IssueStatus | null): string => {
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
  };

  const getStatusIcon = (status: IssueStatus | null): string => {
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
  };

  const formatStatus = (status: IssueStatus | null): string => {
    if (!status) return "—";
    return status.replace(/_/g, " ");
  };

  return (
    <Show when={props.status} fallback={<text fg={theme.colors.dim}>—</text>}>
      <text fg={getStatusColor(props.status)}>
        {props.compact ? "" : getStatusIcon(props.status) + " "}
        {formatStatus(props.status)}
      </text>
    </Show>
  );
}
