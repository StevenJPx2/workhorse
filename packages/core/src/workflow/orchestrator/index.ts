/**
 * Orchestrator module for managing agent lifecycles.
 *
 * @module workflow/orchestrator
 */

// Main orchestrator
export { HarnessOrchestrator } from "./orchestrator.ts";
// Steering (re-exported from workflow/steering)
export type { SteeringCondition, SteeringContext, SteeringRule } from "#workflow/steering";
export { SteeringService } from "#workflow/steering";
// Types
export type {
  AgentState,
  JSONSchema,
  OrchestratorTool,
  SpawnOptions,
  ToolExecutionContext,
  ToolResult,
} from "./types";
// Agent adapter base class
export { AgentAdapter } from "./types";
