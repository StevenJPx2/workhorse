/**
 * Agent health monitor for detecting unresponsive agents.
 *
 * This monitor is registered by the builtin plugin and started by Harness
 * during agent spawn. It emits `agent.crashed` when the agent is detected
 * as unresponsive.
 *
 * @module plugins/builtin/monitors/health
 */

import type { MonitorContext, PollingMonitorOptions } from "#services";

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
 * Create agent health monitor options.
 *
 * This is a stub implementation - full port/PID checking will be
 * implemented when Harness (Step 9) is ready.
 *
 * @example
 * ```typescript
 * // Register at plugin setup
 * ctx.monitors.registerMonitor(createAgentHealthMonitor({
 *   interval: ctx.config.behavior.pollInterval,
 *   port: 3000,  // For Opencode
 *   pid: 12345,  // Process ID
 * }));
 *
 * // Start for an issue when agent spawns
 * ctx.monitors.startMonitor("agent-health", issueId);
 * ```
 */
export function createAgentHealthMonitor(
  options: AgentHealthOptions,
): PollingMonitorOptions {
  return {
    id: "agent-health",
    type: "polling",
    interval: options.interval,
    poll: async (_ctx: MonitorContext) => {
      // Stub: always returns healthy. Full implementation (Harness step) will
      // check port/PID and return hasChanges: true + emit agent.crashed if down.
      return { hasChanges: false };
    },
  };
}
