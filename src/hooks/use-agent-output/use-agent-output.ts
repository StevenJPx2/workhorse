/**
 * useAgentOutput hook - Reactive agent output capture
 *
 * Polls the agent's tmux session for output and provides
 * the recent lines as a reactive signal.
 */

import { createSignal, createEffect, onCleanup, type Accessor } from "solid-js";
import { captureAgentOutput, getAgent } from "../../harness/orchestrator/orchestrator.ts";

/**
 * Options for useAgentOutput
 */
export interface UseAgentOutputOptions {
  /** Ticket ID to capture output for */
  ticketId: Accessor<string | undefined>;
  /** Polling interval in ms (default: 2000) */
  pollInterval?: number;
  /** Max lines to keep (default: 50) */
  maxLines?: number;
  /** Whether polling is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Return value from useAgentOutput
 */
export interface UseAgentOutputReturn {
  /** Recent output lines */
  output: Accessor<string[]>;
  /** Full raw output */
  rawOutput: Accessor<string | null>;
  /** Whether agent is running */
  isRunning: Accessor<boolean>;
  /** Last capture timestamp */
  lastUpdated: Accessor<string | null>;
  /** Force a refresh */
  refresh: () => Promise<void>;
}

/**
 * Hook to capture and display agent output
 *
 * @example
 * const { output, isRunning, refresh } = useAgentOutput({
 *   ticketId: () => selectedTicket()?.id,
 *   pollInterval: 2000,
 *   maxLines: 30,
 * });
 *
 * <For each={output()}>
 *   {(line) => <text>{line}</text>}
 * </For>
 */
export function useAgentOutput(options: UseAgentOutputOptions): UseAgentOutputReturn {
  const {
    ticketId,
    pollInterval = 2000,
    maxLines = 50,
    enabled = true,
  } = options;

  const [output, setOutput] = createSignal<string[]>([]);
  const [rawOutput, setRawOutput] = createSignal<string | null>(null);
  const [isRunning, setIsRunning] = createSignal(false);
  const [lastUpdated, setLastUpdated] = createSignal<string | null>(null);

  let intervalId: Timer | null = null;

  /**
   * Capture current output from agent's tmux session
   */
  const capture = async () => {
    const tid = ticketId();
    if (!tid) {
      setOutput([]);
      setRawOutput(null);
      setIsRunning(false);
      return;
    }

    // Check if agent is running
    const agent = getAgent(tid);
    const running = agent?.state === "running";
    setIsRunning(running);

    if (!running) {
      return;
    }

    try {
      const captured = await captureAgentOutput(tid);
      setRawOutput(captured);
      setLastUpdated(new Date().toISOString());

      if (captured) {
        // Split into lines, filter empty, take last N lines
        const lines = captured
          .split("\n")
          .filter((line) => line.trim().length > 0)
          .slice(-maxLines);
        setOutput(lines);
      }
    } catch (error) {
      console.error("Failed to capture agent output:", error);
    }
  };

  /**
   * Start polling for output
   */
  const startPolling = () => {
    if (intervalId) return;

    intervalId = setInterval(capture, pollInterval);
    // Immediate capture on start
    capture();
  };

  /**
   * Stop polling
   */
  const stopPolling = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  /**
   * Force refresh
   */
  const refresh = async () => {
    await capture();
  };

  // Effect to start/stop polling based on ticketId and enabled state
  createEffect(() => {
    const tid = ticketId();
    const shouldPoll = enabled && !!tid;

    if (shouldPoll) {
      startPolling();
    } else {
      stopPolling();
      setOutput([]);
      setRawOutput(null);
    }
  });

  // Cleanup on unmount
  onCleanup(() => {
    stopPolling();
  });

  return {
    output,
    rawOutput,
    isRunning,
    lastUpdated,
    refresh,
  };
}
