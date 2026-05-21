/**
 * Orchestrator types for managing agent instances.
 *
 * Key concepts:
 * - AgentAdapter: Per-issue class combining tracking data and control methods
 * - ModelRegistry: Base class for adapter-specific model registries
 * - OrchestratorTool: Harness-agnostic tool interface that plugins use
 * - SpawnOptions: Configuration for spawning an agent
 * - CreateOptions: SpawnOptions + orchestrator reference for adapter creation
 * - StopOptions: Configuration for stopping an agent
 *
 * @module workflow/orchestrator/types
 */

// Agent types (base class and options)
export { AgentAdapter } from "../agent/agent.ts";
export type {
  AdapterInfo,
  AgentHarness,
  AgentState,
  CreateOptions,
  ModelInfo,
  StopOptions,
} from "./adapter.ts";

// Model registry types
export { ModelRegistry } from "../registry.ts";

// Spawn options
export type { SpawnOptions } from "./spawn.ts";

// Tool types
export type {
  ImageContent,
  JSONSchema,
  OrchestratorTool,
  ToolExecutionContext,
  ToolResult,
} from "./tools.ts";

// Skill types
export { PluginSkillSchema } from "./skills.ts";
export type { PluginSkill, PluginSkillInput, ResolvedSkill } from "./skills.ts";
