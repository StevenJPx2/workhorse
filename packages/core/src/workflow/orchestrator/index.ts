/**
 * Orchestrator module for managing agent lifecycles.
 *
 * @module workflow/orchestrator
 */

// Main orchestrator
export { HarnessOrchestrator } from "./orchestrator.ts";

// Skill registry
export { SkillRegistry } from "./skills.ts";

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
  ModelInfo,
  StopOptions,
  SpawnOptions,
  JSONSchema,
  OrchestratorTool,
  ToolExecutionContext,
  ToolResult,
} from "./types";

// Skill types
export { PluginSkillSchema } from "./types";
export type { PluginSkill, PluginSkillInput, ResolvedSkill } from "./types";

// Model registry types
export { ModelRegistry } from "./types";
