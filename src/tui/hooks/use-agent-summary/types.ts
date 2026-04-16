/**
 * Types for useAgentSummary hook
 */

import type { AgentStep } from "#core/agent/summarizer/index.ts";

/**
 * Options for the useAgentSummary hook
 */
export interface UseAgentSummaryOptions {
  /** Ticket ID (value or accessor for reactivity) */
  ticketId?: string | (() => string | undefined);
  /** Worktree path (value or accessor for reactivity) */
  worktreePath?: string | (() => string | undefined);
  /** Whether to poll (value or accessor for reactivity) */
  enabled?: boolean | (() => boolean);
  /** Poll interval in ms (default: 3000) */
  pollInterval?: number;
  /** Max steps to keep (default: 10) */
  maxSteps?: number;
}

/**
 * Return value from useAgentSummary
 */
export interface UseAgentSummaryReturn {
  /** Summarized steps */
  steps: () => AgentStep[];
  /** Current status line */
  currentStatus: () => string | null;
  /** Whether we're actively polling */
  isPolling: () => boolean;
  /** Last update timestamp */
  lastUpdated: () => string | null;
  /** Last error if any */
  error: () => string | null;
  /** Manually refresh */
  refresh: () => Promise<void>;
  /** Clear cached data and force re-fetch on next poll */
  invalidate: () => void;
  /** Add a user message to the steps */
  addUserMessage: (message: string) => void;
}
