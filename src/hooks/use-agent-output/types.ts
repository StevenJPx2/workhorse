/**
 * Types for useAgentOutput hook
 */

import type { Accessor } from "solid-js";

/**
 * Options for useAgentOutput hook
 */
export interface UseAgentOutputOptions {
  /** Ticket ID to capture output for */
  ticketId: string;
  /** Whether agent is running (controls polling) */
  isRunning: boolean;
  /** Polling interval in ms (default: 2000) */
  pollInterval?: number;
  /** Max lines to keep (default: 100) */
  maxLines?: number;
  /** Function to capture output */
  captureOutput: (ticketId: string) => Promise<string | null>;
}

/**
 * Return value from useAgentOutput hook
 */
export interface UseAgentOutputReturn {
  /** Output lines (reactive) */
  lines: Accessor<string[]>;
  /** Whether currently polling */
  isPolling: Accessor<boolean>;
  /** Last update timestamp */
  lastUpdated: Accessor<string | null>;
  /** Last error if any */
  error: Accessor<Error | null>;
  /** Manually refresh output */
  refresh: () => Promise<void>;
}
