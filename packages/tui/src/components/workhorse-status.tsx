/**
 * Component to display the Workhorse workflow status (planning, implementing, etc.)
 */
import { Show } from "solid-js";
import type { IssueStatus } from "workhorse-core";

import { getTheme } from "../theme.ts";

interface WorkhorseStatusProps {
  status: IssueStatus | null;
  compact?: boolean;
}

/**
 * Displays the Workhorse workflow status with icon and color.
 */
export function WorkhorseStatus(props: WorkhorseStatusProps) {
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
