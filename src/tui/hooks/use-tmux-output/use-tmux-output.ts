/**
 * useTmuxOutput hook - Capture tmux pane output
 *
 * Polls a tmux session pane and provides the output lines.
 */

import { createSignal, createEffect, onCleanup } from "solid-js";
import { capturePane } from "#core/session/tmux/index.ts";
import type { UseTmuxOutputOptions, UseTmuxOutputReturn } from "./types.ts";

const DEFAULT_POLL_INTERVAL = 2000;
const DEFAULT_MAX_LINES = 50;

/**
 * Hook for capturing tmux pane output
 */
export function useTmuxOutput(options: UseTmuxOutputOptions): UseTmuxOutputReturn {
  const pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;

  const [lines, setLines] = createSignal<string[]>([]);
  const [isPolling, setIsPolling] = createSignal(false);
  const [lastUpdated, setLastUpdated] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  let timer: ReturnType<typeof setInterval> | null = null;

  const refresh = async () => {
    try {
      setError(null);
      // capturePane expects ticketId, but we use sessionName which is the ticketId
      const output = await capturePane(options.sessionName);

      if (output) {
        // Split into lines, filter empty, keep last N
        const newLines = output
          .split("\n")
          .filter((line: string) => line.trim().length > 0)
          .slice(-maxLines);
        setLines(newLines);
      }
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Start/stop polling based on enabled
  createEffect(() => {
    const enabled = options.enabled ?? true;

    // Clear existing timer
    if (timer) {
      clearInterval(timer);
      timer = null;
      setIsPolling(false);
    }

    if (!enabled || !options.sessionName) {
      return;
    }

    // Start polling
    setIsPolling(true);
    refresh(); // Initial fetch
    timer = setInterval(refresh, pollInterval);
  });

  onCleanup(() => {
    if (timer) {
      clearInterval(timer);
      timer = null;
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
