/**
 * Agent health poller
 *
 * Polls agent sessions to check their health status.
 */

import type {
  BasePollerOptions,
  PollerState,
  PollResult,
  AgentPollResult,
  Poller,
} from "./types.ts";
import { checkAgentHealth } from "../orchestrator/orchestrator.ts";

/**
 * Options for agent poller
 */
export interface AgentPollerOptions extends BasePollerOptions {
  /** Ticket ID to poll */
  ticketId: string;
  /** Callback when agent becomes unhealthy */
  onUnhealthy?: (result: AgentPollResult) => void;
  /** Callback when agent becomes healthy */
  onHealthy?: (result: AgentPollResult) => void;
}

/**
 * Create an agent health poller
 */
export function createAgentPoller(options: AgentPollerOptions): Poller<AgentPollResult> {
  let state: PollerState = "idle";
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let lastResult: PollResult<AgentPollResult> | null = null;
  let wasHealthy: boolean | null = null;

  const poll = async (): Promise<PollResult<AgentPollResult>> => {
    const timestamp = new Date().toISOString();

    try {
      const health = await checkAgentHealth(options.ticketId);

      const data: AgentPollResult = {
        ticketId: options.ticketId,
        healthy: health.healthy,
        sessionExists: health.sessionExists,
        lastOutput: health.lastOutput,
      };

      // Detect state changes
      if (wasHealthy !== null) {
        if (wasHealthy && !health.healthy) {
          options.onUnhealthy?.(data);
        } else if (!wasHealthy && health.healthy) {
          options.onHealthy?.(data);
        }
      }
      wasHealthy = health.healthy;

      const result: PollResult<AgentPollResult> = {
        success: true,
        data,
        timestamp,
      };

      lastResult = result;
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      options.onError?.(err);
      state = "error";

      const result: PollResult<AgentPollResult> = {
        success: false,
        error: err.message,
        timestamp,
      };

      lastResult = result;
      return result;
    }
  };

  const start = (): void => {
    if (state === "running") return;

    state = "running";

    // Initial poll
    poll().catch(() => {
      // Error handled in poll
    });

    // Set up interval
    intervalId = setInterval(() => {
      poll().catch(() => {
        // Error handled in poll
      });
    }, options.interval);
  };

  const stop = (): void => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    state = "stopped";
  };

  // Auto-start if requested
  if (options.autoStart) {
    start();
  }

  return {
    get state() {
      return state;
    },
    start,
    stop,
    poll,
    lastResult: () => lastResult,
  };
}
