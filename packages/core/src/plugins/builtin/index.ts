/**
 * Built-in Workhorse plugins.
 *
 * @module plugins/builtin
 */

export { corePlugin } from "./plugin.ts";

// Export monitor factory for advanced usage (e.g., custom health check options)
export { createAgentHealthMonitor, type AgentHealthOptions } from "./monitors";
