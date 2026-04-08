/**
 * Types for useAgent hook
 */

import type { Accessor } from "solid-js";
import type { AgentType } from "../../types/config.ts";
import type {
  AgentInstance,
  AgentState,
  HealthCheckResult,
} from "../../harness/orchestrator/types.ts";

/**
 * Options for useAgent hook
 */
export interface UseAgentOptions {
  /** Repository path for worktree operations (can be a getter for lazy resolution) */
  repoPath?: string | (() => string | undefined);
  /** Jira cloud ID for MCP config (can be a getter for lazy resolution) */
  jiraCloudId?: string | (() => string | undefined);
  /** Whether to auto-load agents on mount */
  autoLoad?: boolean;
  /** Poll interval for health checks (ms, 0 to disable) */
  healthCheckInterval?: number;
  /** Callback when agent state changes */
  onStateChange?: (ticketId: string, state: AgentState) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

/**
 * Options for spawning an agent
 */
export interface SpawnOptions {
  ticketId: string;
  agentType: AgentType;
  issueType?: string;
  baseBranch?: string;
  summary?: string;
  description?: string;
}

/**
 * Return value from useAgent hook
 */
export interface UseAgentReturn {
  /** Map of ticket ID to agent instance */
  agents: Accessor<Map<string, AgentInstance>>;
  /** Loading state */
  isLoading: Accessor<boolean>;
  /** Last error if any */
  error: Accessor<Error | null>;
  /** Spawn an agent for a ticket */
  spawn: (options: SpawnOptions) => Promise<AgentInstance | null>;
  /** Stop an agent */
  stop: (ticketId: string, removeWorktree?: boolean) => Promise<boolean>;
  /** Get agent instance */
  get: (ticketId: string) => AgentInstance | undefined;
  /** Check if agent is running */
  isRunning: (ticketId: string) => boolean;
  /** Get agent state */
  getState: (ticketId: string) => AgentState | undefined;
  /** Send message to agent */
  sendMessage: (ticketId: string, message: string) => Promise<boolean>;
  /** Capture agent output */
  captureOutput: (ticketId: string) => Promise<string | null>;
  /** Check agent health */
  checkHealth: (ticketId: string) => Promise<HealthCheckResult | null>;
  /** Get all running agents */
  getRunning: () => AgentInstance[];
  /** Reload agent list */
  reload: () => void;
}
