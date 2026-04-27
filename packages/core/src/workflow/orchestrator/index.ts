/**
 * Orchestrator module for managing agent lifecycles.
 *
 * @module workflow/orchestrator
 */

// Main orchestrator
export { HarnessOrchestrator } from "./orchestrator.ts";
export type { SteeringCondition, SteeringContext, SteeringRule } from "./steering/index.ts";
// Steering
export { SteeringService } from "./steering/index.ts";
// Types
export type {
  AgentState,
  JSONSchema,
  OrchestratorTool,
  SpawnOptions,
  ToolExecutionContext,
  ToolResult,
} from "./types/index.ts";
// Agent adapter base class
export { AgentAdapter } from "./types/index.ts";
