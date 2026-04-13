/**
 * Types for useTmuxOutput hook
 */

/**
 * Options for the useTmuxOutput hook
 */
export interface UseTmuxOutputOptions {
  /** Tmux session name to capture from */
  sessionName: string;
  /** Whether to poll (e.g., only when agent exists) */
  enabled?: boolean;
  /** Poll interval in ms (default: 2000) */
  pollInterval?: number;
  /** Max lines to keep (default: 50) */
  maxLines?: number;
}

/**
 * Return value from useTmuxOutput
 */
export interface UseTmuxOutputReturn {
  /** Output lines */
  lines: () => string[];
  /** Whether we're actively polling */
  isPolling: () => boolean;
  /** Last update timestamp */
  lastUpdated: () => string | null;
  /** Last error if any */
  error: () => string | null;
  /** Manually refresh */
  refresh: () => Promise<void>;
}
