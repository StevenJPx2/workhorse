/**
 * Orchestrator module for managing agent lifecycles.
 *
 * @module workflow/orchestrator
 */

// Main orchestrator
export { HarnessOrchestrator } from "./orchestrator.ts";

// Steering (re-exported from workflow/steering)
export type {
  SteeringCondition,
  SteeringRuleConfig,
  SteeringRuleConfigInput,
} from "#workflow/steering";
export { SteeringRule } from "#workflow/steering";

// Agent adapter base class and types
export { AgentAdapter } from "./types";
export type {
  AdapterInfo,
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
