/**
 * useAgentProgress hook - Track agent progress and session memory
 *
 * Provides reactive state for agent progress display including:
 * - Current agent state (running, stopped, crashed)
 * - Running duration
 * - Session memory (recent activity, key decisions)
 */

import { createSignal, createEffect, onCleanup } from "solid-js";
import { getAgentStateConfig } from "../../theme/status.ts";
import { colors } from "../../theme/colors.ts";
import { readSessionMemory, hasSessionMemory } from "#core/session/session-memory.ts";
import type { AgentState } from "#core/agent/orchestrator/types.ts";
import { resolveOption } from "./types.ts";
import type {
  UseAgentProgressOptions,
  UseAgentProgressReturn,
  AgentProgressInfo,
  UseAgentProgressDeps,
} from "./types.ts";

const DEFAULT_POLL_INTERVAL = 5000;

function createDefaultProgress(state: AgentState = "idle"): AgentProgressInfo {
  const stateConfig = getAgentStateConfig(state, colors);
  return {
    state,
    stateLabel: stateConfig.label,
    stateIndicator: stateConfig.indicator,
    stateColor: stateConfig.color,
    startedAt: null,
    runningDuration: null,
    recentActivity: [],
    keyDecisions: [],
    summary: null,
    hasSessionMemory: false,
  };
}

function formatDuration(startedAt: string): string {
  const start = new Date(startedAt);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

const defaultDeps: UseAgentProgressDeps = {
  readSessionMemory,
  hasSessionMemory,
};

export function useAgentProgress(
  options: UseAgentProgressOptions,
  deps: UseAgentProgressDeps = defaultDeps,
): UseAgentProgressReturn {
  const initialAgentState = resolveOption(options.agentState) ?? "idle";
  const [progress, setProgress] = createSignal<AgentProgressInfo>(
    createDefaultProgress(initialAgentState),
  );
  const [isLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const refresh = () => {
    try {
      const state = resolveOption(options.agentState) ?? "idle";
      const stateConfig = getAgentStateConfig(state, colors);
      const worktreePath = resolveOption(options.worktreePath);

      let sessionMemory = null;
      let hasMemory = false;

      if (worktreePath) {
        hasMemory = deps.hasSessionMemory(worktreePath);
        if (hasMemory) {
          sessionMemory = deps.readSessionMemory(worktreePath);
        }
      }

      let runningDuration: string | null = null;
      let startedAt: string | null = null;

      if (sessionMemory?.startedAt) {
        startedAt = sessionMemory.startedAt;
        if (state === "running" || state === "starting") {
          runningDuration = formatDuration(sessionMemory.startedAt);
        }
      }

      const prev = progress();
      const newProgress = {
        state,
        stateLabel: stateConfig.label,
        stateIndicator: stateConfig.indicator,
        stateColor: stateConfig.color,
        startedAt,
        runningDuration,
        recentActivity: sessionMemory?.recentActivity ?? [],
        keyDecisions: sessionMemory?.keyDecisions ?? [],
        summary: sessionMemory?.summary ?? null,
        hasSessionMemory: hasMemory,
      };

      if (
        prev.state !== newProgress.state ||
        prev.runningDuration !== newProgress.runningDuration ||
        prev.hasSessionMemory !== newProgress.hasSessionMemory ||
        prev.summary !== newProgress.summary
      ) {
        setProgress(newProgress);
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      if (error()?.message !== e.message) {
        setError(e);
      }
    }
  };

  createEffect(() => {
    resolveOption(options.ticketId);
    resolveOption(options.worktreePath);
    resolveOption(options.agentState);
    refresh();
  });

  createEffect(() => {
    const state = resolveOption(options.agentState);
    const interval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;

    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    if ((state === "running" || state === "starting") && interval > 0) {
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
    progress,
    isLoading,
    error,
    refresh,
  };
}
