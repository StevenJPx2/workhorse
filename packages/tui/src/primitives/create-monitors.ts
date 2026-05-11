/**
 * Primitive for tracking running monitors for a specific issue.
 * Polls MonitorService.getRunningMonitors() at a fixed interval.
 */

import { createSignal, onCleanup, createEffect, type Accessor } from "solid-js";
import type { MonitorStatus, MonitorService } from "@jiratown/core";

export interface MonitorsState {
  monitors: MonitorStatus[];
  loading: boolean;
}

export interface CreateMonitorsOptions {
  /** MonitorService instance */
  monitors: MonitorService;
  /** Issue ID to track monitors for */
  issueId: Accessor<string | null>;
  /** Poll interval in ms (default: 2000) */
  pollInterval?: number;
}

/**
 * Create reactive monitor tracking for an issue.
 * Polls getRunningMonitors() to reflect current monitor states.
 */
export function createMonitors(options: CreateMonitorsOptions) {
  const { monitors, issueId, pollInterval = 2000 } = options;

  const [state, setState] = createSignal<MonitorsState>({
    monitors: [],
    loading: false,
  });

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  /** Fetch running monitors for current issue */
  const fetchMonitors = () => {
    const id = issueId();
    if (!id) {
      setState({ monitors: [], loading: false });
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));

    try {
      setState({ monitors: monitors.getRunningMonitors(id), loading: false });
    } catch {
      setState({ monitors: [], loading: false });
    }
  };

  const setupPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    if (issueId()) {
      fetchMonitors();
      pollTimer = setInterval(fetchMonitors, pollInterval);
    } else {
      setState({ monitors: [], loading: false });
    }
  };

  // Initial setup (synchronous when issueId is already set)
  setupPolling();

  // React to issueId changes
  createEffect(setupPolling);

  onCleanup(() => {
    if (pollTimer) {
      clearInterval(pollTimer);
    }
  });

  return { state, refresh: fetchMonitors };
}
