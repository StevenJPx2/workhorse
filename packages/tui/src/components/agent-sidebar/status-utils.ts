/**
 * Status display utilities for agent sidebar.
 *
 * Uses lookup objects instead of switch statements to reduce cognitive load.
 * Each status has a single, declarative configuration in one place.
 */
import type { AgentState, IssueStatus } from "workhorse-core";

import type { getTheme } from "../../theme.ts";

type Theme = ReturnType<typeof getTheme>;
type ThemeColorKey =
  | "success"
  | "warning"
  | "error"
  | "dim"
  | "info"
  | "accent";

// ─── Agent State Configuration ───────────────────────────────────────────────
// Single source of truth for agent state display properties

interface AgentStateConfig {
  colorKey: ThemeColorKey;
  icon: string;
  text: string;
}

const AGENT_STATE_CONFIG: Record<AgentState, AgentStateConfig> = {
  running: { colorKey: "success", icon: "●", text: "Running" },
  starting: { colorKey: "success", icon: "◐", text: "Starting..." },
  crashed: { colorKey: "warning", icon: "!", text: "Crashed" },
  stopped: { colorKey: "error", icon: "■", text: "Stopped" },
  stopping: { colorKey: "error", icon: "■", text: "Stopping..." },
};

const DEFAULT_AGENT_STATE: AgentStateConfig = {
  colorKey: "dim",
  icon: "○",
  text: "Unknown",
};

function getAgentStateConfig(
  state: AgentState | null | undefined,
): AgentStateConfig {
  return AGENT_STATE_CONFIG[state ?? "stopped"] ?? DEFAULT_AGENT_STATE;
}

// ─── Workflow Status Configuration ───────────────────────────────────────────
// Single source of truth for workflow status display properties

interface WorkflowStatusConfig {
  colorKey: ThemeColorKey;
  icon: string;
}

const WORKFLOW_STATUS_CONFIG: Record<IssueStatus, WorkflowStatusConfig> = {
  planning: { colorKey: "info", icon: "📋" },
  implementing: { colorKey: "success", icon: "⚡" },
  in_review: { colorKey: "accent", icon: "👀" },
  blocked: { colorKey: "error", icon: "🚫" },
  done: { colorKey: "success", icon: "✅" },
  pending: { colorKey: "dim", icon: "" },
};

const DEFAULT_WORKFLOW_STATUS: WorkflowStatusConfig = {
  colorKey: "dim",
  icon: "",
};

function getWorkflowStatusConfig(
  status: IssueStatus | null | undefined,
): WorkflowStatusConfig {
  if (!status) return DEFAULT_WORKFLOW_STATUS;
  return WORKFLOW_STATUS_CONFIG[status] ?? DEFAULT_WORKFLOW_STATUS;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function truncateModel(model: string, maxLen: number): string {
  if (model.length <= maxLen) return model;
  return model.slice(0, maxLen - 1) + "…";
}

export function getStatusColor(
  state: AgentState | null | undefined,
  theme: Theme,
): string {
  return theme.colors[getAgentStateConfig(state).colorKey];
}

export function getStatusIcon(state: AgentState | null | undefined): string {
  return getAgentStateConfig(state).icon;
}

export function getStatusText(state: AgentState | null | undefined): string {
  return getAgentStateConfig(state).text;
}

export function getWorkflowStatusColor(
  status: IssueStatus | null | undefined,
  theme: Theme,
): string {
  return theme.colors[getWorkflowStatusConfig(status).colorKey];
}

export function getWorkflowStatusIcon(
  status: IssueStatus | null | undefined,
): string {
  return getWorkflowStatusConfig(status).icon;
}

export function formatWorkflowStatus(
  status: IssueStatus | null | undefined,
): string {
  if (!status) return "";
  return status.replace(/_/g, " ");
}
