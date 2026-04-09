/**
 * useAgentOutput hook - Poll and display agent output
 *
 * Captures tmux output for a running agent and provides
 * reactive state for display.
 */

import { createSignal, createEffect, onCleanup } from "solid-js";
import type { UseAgentOutputOptions, UseAgentOutputReturn } from "./types.ts";

const DEFAULT_POLL_INTERVAL = 2000;
const DEFAULT_MAX_LINES = 100;

/**
 * Hook for polling agent output
 */
export function useAgentOutput(options: UseAgentOutputOptions): UseAgentOutputReturn {
  const [lines, setLines] = createSignal<string[]>([]);
  const [isPolling, setIsPolling] = createSignal(false);
  const [lastUpdated, setLastUpdated] = createSignal<string | null>(null);
  const [error, setError] = createSignal<Error | null>(null);

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;

  const refresh = async () => {
    try {
      setError(null);
      const output = await options.captureOutput(options.ticketId);

      if (output !== null) {
        // Split into lines, filter empty, keep last N
        const newLines = output
          .split("\n")
          .filter((line) => line.trim().length > 0)
          .slice(-maxLines);

        setLines(newLines);
        setLastUpdated(new Date().toISOString());
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
    }
  };

  // Start/stop polling based on isRunning
  createEffect(() => {
    const running = options.isRunning;
    const interval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;

    // Clear existing timer
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
      setIsPolling(false);
    }

    // Start polling if running
    if (running && interval > 0) {
      setIsPolling(true);
      // Initial fetch
      refresh();
      // Set up polling
      pollTimer = setInterval(refresh, interval);
    }
  });

  onCleanup(() => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  });

  return {
    lines,
    isPolling,
    lastUpdated,
    error,
    refresh,
  };
}
