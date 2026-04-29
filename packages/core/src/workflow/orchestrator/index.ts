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

// Agent adapter base class and types
export { AgentAdapter } from "./types";
export type {
  AgentHarness,
  AgentState,
  CreateOptions,
  StopOptions,
  SpawnOptions,
  JSONSchema,
  OrchestratorTool,
  ToolExecutionContext,
  ToolResult,
} from "./types";
