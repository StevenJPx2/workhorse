/**
 * Types for useAgentProgress hook
 */

import type { Accessor } from "solid-js";
import type { AgentState } from "../../harness/orchestrator/types.ts";
import type { SessionEvent } from "../../harness/session/session-types.ts";

/**
 * Resolve an option that may be a value or accessor
 */
export type ReactiveOption<T> = T | (() => T);

/**
 * Resolve a reactive option to its value
 */
export function resolveOption<T>(option: ReactiveOption<T>): T {
  return typeof option === "function" ? (option as () => T)() : option;
}

/**
 * Options for useAgentProgress hook
 */
export interface UseAgentProgressOptions {
  /** Ticket ID to track (value or accessor for reactivity) */
  ticketId: ReactiveOption<string>;
  /** Worktree path for session memory (value or accessor for reactivity) */
  worktreePath: ReactiveOption<string | null>;
  /** Current agent state (value or accessor for reactivity) */
  agentState?: ReactiveOption<AgentState | undefined>;
  /** Polling interval in ms (default: 5000, 0 to disable) */
  pollInterval?: number;
}

/**
 * Agent progress info for display
 */
export interface AgentProgressInfo {
  /** Current agent state */
  state: AgentState;
  /** Human-readable state label */
  stateLabel: string;
  /** State indicator character */
  stateIndicator: string;
  /** Color for state display */
  stateColor: string;
  /** When agent started (ISO string) */
  startedAt: string | null;
  /** Human-readable duration (e.g., "5 minutes") */
  runningDuration: string | null;
  /** Recent activity events */
  recentActivity: SessionEvent[];
  /** Key decisions made */
  keyDecisions: string[];
  /** Session summary */
  summary: string | null;
  /** Whether session memory exists */
  hasSessionMemory: boolean;
}

/**
 * Return value from useAgentProgress hook
 */
export interface UseAgentProgressReturn {
  /** Current progress info */
  progress: Accessor<AgentProgressInfo>;
  /** Whether currently loading */
  isLoading: Accessor<boolean>;
  /** Last error if any */
  error: Accessor<Error | null>;
  /** Manually refresh progress */
  refresh: () => void;
}
