/**
 * Agent status summarization
 *
 * Pure functions for extracting agent status from OpenCode SDK messages.
 */

export type { AgentStep } from "./types.ts";

// Text extraction (no external deps)
export { extractStatusFromMessage } from "./extract-status.ts";

// OpenCode SDK-based status fetching
export { getAgentStatus, clearSessionCache, clearAllSessionCache } from "./get-agent-status.ts";
