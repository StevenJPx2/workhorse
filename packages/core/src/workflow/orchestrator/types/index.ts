/**
 * Orchestrator types for managing agent instances.
 *
 * Key concepts:
 * - AgentAdapter: Per-issue class combining tracking data and control methods
 * - OrchestratorTool: Harness-agnostic tool interface that plugins use
 * - SpawnOptions: Configuration for starting a new agent
 *
 * @module workflow/orchestrator/types
 */

// Agent types
export { AgentAdapter } from "./agent.ts";
export type { AgentHarness, AgentState } from "./agent.ts";

// Adapter context
export type { AdapterContext } from "./adapter-context.ts";

// Adapter class constructor
export type { AdapterClass } from "./adapter-class.ts";

// Spawn/stop options
export type { SpawnOptions, StopOptions } from "./spawn.ts";

// Tool types
export type { JSONSchema, OrchestratorTool, ToolExecutionContext, ToolResult } from "./tools.ts";
