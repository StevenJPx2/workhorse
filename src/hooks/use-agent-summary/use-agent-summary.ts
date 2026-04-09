/**
 * useAgentSummary hook - Get agent status using SDK or tmux
 *
 * Tries OpenCode SDK first for accurate status, falls back to tmux capture.
 * No longer depends on Ollama for summarization.
 */

import { createSignal, createEffect, onCleanup } from "solid-js";
import { getAgentStatus } from "./get-agent-status.ts";
import type {
  UseAgentSummaryOptions,
  UseAgentSummaryReturn,
  AgentStep,
} from "./types.ts";

const DEFAULT_POLL_INTERVAL = 3000;
const DEFAULT_MAX_STEPS = 10;

function resolveOption<T>(option: T | (() => T)): T {
  return typeof option === "function" ? (option as () => T)() : option;
}

export function useAgentSummary(options: UseAgentSummaryOptions): UseAgentSummaryReturn {
  const pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;

  const [steps, setSteps] = createSignal<AgentStep[]>([]);
  const [currentStatus, setCurrentStatus] = createSignal<string | null>(null);
  const [isPolling, setIsPolling] = createSignal(false);
  const [lastUpdated, setLastUpdated] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  let timer: ReturnType<typeof setInterval> | null = null;
  let lastStepsKey = "";

  const refresh = async () => {
    const ticketId = resolveOption(options.ticketId);
    const worktreePath = resolveOption(options.worktreePath);

    try {
      if (!ticketId || !worktreePath) {
        return;
      }

      const newSteps = await getAgentStatus(ticketId, worktreePath);

      const stepsKey = newSteps.map(s => s.description).join("|");
      if (stepsKey === lastStepsKey) {
        return;
      }
      lastStepsKey = stepsKey;

      if (error()) {
        setError(null);
      }

      if (newSteps.length > 0) {
        setCurrentStatus(newSteps[0].description);
        setSteps((prev) => {
          const combined = [...prev, ...newSteps];
          const seen = new Set<string>();
          const deduped = combined.filter((s) => {
            if (seen.has(s.description)) return false;
            seen.add(s.description);
            return true;
          });
          return deduped.slice(-maxSteps);
        });
        setLastUpdated(new Date().toISOString());
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (error() !== errMsg) {
        setError(errMsg);
      }
    }
  };

  const invalidate = () => {
    lastStepsKey = "";
    setSteps([]);
    setCurrentStatus(null);
  };

  createEffect(() => {
    const enabled = resolveOption(options.enabled ?? true);
    const worktreePath = resolveOption(options.worktreePath);

    if (timer) {
      clearInterval(timer);
      timer = null;
      setIsPolling(false);
    }

    if (!enabled || !worktreePath) {
      return;
    }

    setIsPolling(true);
    refresh();
    timer = setInterval(refresh, pollInterval);
  });

  onCleanup(() => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  });

  return {
    steps,
    currentStatus,
    isPolling,
    lastUpdated,
    error,
    refresh,
    invalidate,
  };
}