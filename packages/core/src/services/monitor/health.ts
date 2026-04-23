import { Monitor } from "./monitor.ts";
import type { MonitorContext } from "./types.ts";

/**
 * Options for creating an agent health monitor.
 */
export interface AgentHealthOptions {
  /** Port to check (for Opencode) */
  port?: number;
  /** Process ID to check */
  pid?: number;
  /** Polling interval in ms */
  interval: number;
}

/**
 * Create an agent health monitor.
 *
 * This is a stub implementation - full port/PID checking will be
 * implemented when Harness (Step 9) is ready.
 *
 * The agent health monitor is started by Harness during agent spawn.
 * It emits `agent.crashed` when the agent is detected as unresponsive.
 *
 * @example
 * ```typescript
 * // Harness starts health monitor during spawn
 * monitorService.startMonitor(issueId, ctx, createAgentHealthMonitor({
 *   interval: config.behavior.pollInterval,
 *   port: 3000,  // For Opencode
 *   pid: 12345,  // Process ID
 * }));
 * ```
 */
export function createAgentHealthMonitor(options: AgentHealthOptions): Monitor {
  return new Monitor({
    name: "agent-health",
    type: "local",
    interval: options.interval,
    poll: async (_ctx: MonitorContext) => {
      // Stub: always returns healthy. Full implementation (Harness step) will
      // check port/PID and return hasChanges: true + emit agent.crashed if down.
      return { hasChanges: false };
    },
  });
}
