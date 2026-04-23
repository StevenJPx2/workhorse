import type { Monitor, MonitorContext, MonitorFactory, MonitorResult } from "./types.ts";

/**
 * Options for creating an agent health monitor.
 */
export interface AgentHealthOptions {
  /** Port to check (for Opencode) */
  port?: number;
  /** Process ID to check */
  pid?: number;
  /** Custom polling interval in ms (defaults to config.behavior.pollInterval) */
  checkInterval?: number;
}

/**
 * Create a monitor factory for agent health checks.
 *
 * This is a stub implementation - full port/PID checking will be
 * implemented when Harness (Step 9) is ready.
 *
 * The agent health monitor is registered by Harness during agent spawn,
 * not by plugins. It emits `agent.crashed` when the agent is detected
 * as unresponsive.
 *
 * @example
 * ```typescript
 * // Harness registers health monitor during spawn
 * monitors.registerMonitor("agent-health", createAgentHealthMonitor({
 *   port: 3000,  // For Opencode
 *   pid: 12345,  // Process ID
 * }));
 * ```
 */
export function createAgentHealthMonitor(options: AgentHealthOptions = {}): MonitorFactory {
  return (ctx: MonitorContext): Monitor => {
    const interval = options.checkInterval ?? ctx.config.behavior.pollInterval;

    return {
      name: "agent-health",
      type: "local",
      interval,
      async poll(): Promise<MonitorResult> {
        // Stub: always returns healthy. Full implementation (Harness step) will
        // check port/PID and return hasChanges: true + emit agent.crashed if down.
        return { hasChanges: false };
      },
    };
  };
}
