/**
 * useAgentSummary - Get agent status from OpenCode SDK
 */

export { useAgentSummary } from "./use-agent-summary.ts";

// Re-export core functions for backwards compatibility
export {
  getAgentStatus,
  clearSessionCache,
  clearAllSessionCache,
} from "#core/agent/summarizer/index.ts";

export type { UseAgentSummaryOptions, UseAgentSummaryReturn } from "./types.ts";
export type { AgentStep } from "#core/agent/summarizer/index.ts";
