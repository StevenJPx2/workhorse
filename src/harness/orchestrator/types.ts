/**
 * Orchestrator types for agent lifecycle management
 */

import type { AgentType } from "../../types/config.ts";
import type { TicketStatus } from "../../types/ticket.ts";
import type { TmuxSession } from "../session/tmux.ts";
import type { Worktree } from "../session/worktree.ts";

/**
 * Agent state tracked by orchestrator
 */
export type AgentState =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "crashed";

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
  mcpConfigPath: string | null;
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
 * Agent health check result
 */
export interface HealthCheckResult {
  ticketId: string;
  healthy: boolean;
  sessionExists: boolean;
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
}
