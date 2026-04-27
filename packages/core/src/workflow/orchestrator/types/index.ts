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
export type { AgentAdapter, AgentHarness, AgentState } from "./agent.ts";

// Spawn/stop options
export type { SpawnOptions, StopOptions } from "./spawn.ts";

// Tool types
export type { JSONSchema, OrchestratorTool, ToolExecutionContext, ToolResult } from "./tools.ts";
