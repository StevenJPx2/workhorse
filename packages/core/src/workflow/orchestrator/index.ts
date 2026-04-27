/**
 * Orchestrator module for managing agent lifecycles.
 *
 * @module workflow/orchestrator
 */

// Main orchestrator
export { HarnessOrchestrator } from "./orchestrator.ts";
// Agent adapter base class
export { AgentAdapter } from "./types/index.ts";
// Types
export type {
  AdapterClass,
  AdapterContext,
  AgentHarness,
  AgentState,
  OrchestratorTool,
  ToolExecutionContext,
  ToolResult,
} from "./types/index.ts";
