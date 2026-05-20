/**
 * Status display utilities for agent sidebar.
 */

import type { AgentState, IssueStatus } from "workhorse-core";

import type { getTheme } from "../../theme.ts";

type Theme = ReturnType<typeof getTheme>;

export function truncateModel(model: string, maxLen: number): string {
  if (model.length <= maxLen) return model;
  return model.slice(0, maxLen - 1) + "…";
}

export function getStatusColor(state: AgentState | null | undefined, theme: Theme): string {
  switch (state ?? "stopped") {
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
}

export function getStatusIcon(state: AgentState | null | undefined): string {
  switch (state ?? "stopped") {
    case "running":
      return "●";
    case "starting":
      return "◐";
    case "crashed":
      return "⚠";
    case "stopped":
      return "■";
    default:
      return "○";
  }
}

export function getStatusText(state: AgentState | null | undefined): string {
  switch (state ?? "stopped") {
    case "running":
      return "Running";
    case "starting":
      return "Starting...";
    case "stopping":
      return "Stopping...";
    case "crashed":
      return "Crashed";
    case "stopped":
      return "Stopped";
    default:
      return "Unknown";
  }
}

export function getWorkflowStatusColor(
  status: IssueStatus | null | undefined,
  theme: Theme,
): string {
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

export function getWorkflowStatusIcon(status: IssueStatus | null | undefined): string {
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
      return "";
  }
}

export function formatWorkflowStatus(status: IssueStatus | null | undefined): string {
  if (!status) return "";
  return status.replace(/_/g, " ");
}
