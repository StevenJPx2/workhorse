/**
 * Orchestrator types for agent lifecycle management
 */

import type { AgentType } from "#types/config.ts";

import type { TmuxSession } from "../../session/tmux/index.ts";
import type { Worktree } from "../../session/worktree/index.ts";

/**
 * Agent state tracked by orchestrator
 */
export type AgentState = "idle" | "starting" | "running" | "stopping" | "stopped" | "crashed";

/**
 * Agent instance managed by orchestrator
 */
export interface AgentInstance {
  ticketId: string;
  agentType: AgentType;
  state: AgentState;
  session: TmuxSession | null;
  worktree: Worktree | null;
  startedAt: string | null;
  stoppedAt: string | null;
  lastHealthCheck: string | null;
}

/**
 * Options for spawning an agent
 */
export interface SpawnAgentOptions {
  ticketId: string;
  agentType: AgentType;
  repoPath: string;
  issueType?: string;
  baseBranch?: string;
  jiraCloudId?: string;
  jiraSummary?: string;
  jiraDescription?: string;
  /** Full Jira URL for the ticket (e.g., "https://company.atlassian.net/browse/AM-123") */
  jiraUrl?: string;
  /** Current ticket status from database (for resume context) */
  status?: string;
  /** PR URL if PR has been created */
  prUrl?: string;
  /** PR number if PR has been created */
  prNumber?: number;
  /** Fresh GitHub PR context summary (pre-formatted) */
  prContextSummary?: string;
  /** Fresh Jira ticket context summary (pre-formatted) */
  jiraContextSummary?: string;
}

/**
 * Result of spawning an agent
 */
export interface SpawnResult {
  success: boolean;
  instance?: AgentInstance;
  error?: string;
}

/**
 * Result of stopping an agent
 */
export interface StopResult {
  success: boolean;
  error?: string;
}

/**
 * OpenCode session status
 */
export type OpenCodeStatus =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number }
  | { type: "offline"; error: string };

/**
 * Agent health check result
 */
export interface HealthCheckResult {
  ticketId: string;
  healthy: boolean;
  sessionExists: boolean;
  openCodeHealthy?: boolean;
  openCodeStatus?: OpenCodeStatus;
  lastOutput?: string;
  checkedAt: string;
}

/**
 * MCP config for agent
 */
export interface AgentMcpConfig {
  mcpServers: {
    jiratown: {
      command: string;
      args: string[];
      env?: Record<string, string>;
    };
    atlassian?: {
      command: string;
      args: string[];
    };
  };
}

/**
 * System instruction for agent
 */
export interface AgentSystemInstruction {
  ticketId: string;
  jiraKey: string;
  summary: string | null;
  description: string | null;
  worktreePath: string;
  branchName: string;
  /** Full Jira URL for the ticket */
  jiraUrl?: string;
  /** Jira cloud ID for Atlassian MCP calls */
  jiraCloudId?: string;
  /** Custom project-specific prompt from config */
  customPrompt?: string | null;
  /** Current ticket status (for resume context) */
  status?: string;
  /** PR URL if PR has been created */
  prUrl?: string;
}
