/**
 * Orchestrator exports
 */

// Types
export type {
  AgentState,
  AgentInstance,
  SpawnAgentOptions,
  SpawnResult,
  StopResult,
  HealthCheckResult,
  AgentMcpConfig,
  AgentSystemInstruction,
} from "./types.ts";

// MCP Config
export {
  getConfigDir,
  generateMcpConfig,
  writeMcpConfig,
  buildAgentCommand,
} from "./mcp-config.ts";

// System Prompt
export { generateSystemPrompt, generateInitialPrompt } from "./system-prompt/index.ts";

// Orchestrator
export {
  spawnAgent,
  stopAgent,
  checkAgentHealth,
  getAgent,
  getAllAgents,
  getAgentsByState,
  sendMessageToAgent,
  captureAgentOutput,
  injectSystemInbox,
} from "./orchestrator.ts";

// Discovery
export { discoverAgents, discoverAgentByTicketId } from "./discover-agents.ts";
