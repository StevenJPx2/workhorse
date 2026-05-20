/**
 * Type definitions for agent adapters.
 * @module workflow/orchestrator/types/adapter
 */

// Import type-only to avoid circular dependency at runtime
import type { HarnessOrchestrator } from "../orchestrator.ts";
import type { SpawnOptions } from "./spawn.ts";

/**
 * Agent harness identifier.
 * Validated at runtime against registered adapters.
 */
export type AgentHarness = string;

/**
 * Agent lifecycle states.
 */
export type AgentState = "starting" | "running" | "stopping" | "stopped" | "crashed";

/**
 * Model information for UI display.
 * Generic interface that all agent adapters should implement.
 */
export interface ModelInfo {
  /** Provider name (e.g., "anthropic", "openai", "opencode") */
  provider: string;
  /** Model ID (e.g., "claude-sonnet-4-20250514") */
  id: string;
  /** Human-readable model name */
  name: string;
  /** Model description */
  description: string;
  /** Context window size in tokens */
  contextWindow: number;
  /** Whether this model supports reasoning/thinking */
  reasoning: boolean;
  /** Whether this is the default model for the provider */
  isDefault: boolean;
}

/**
 * Options for creating an adapter via AgentAdapter.create().
 * Extends SpawnOptions with orchestrator reference.
 */
export interface CreateOptions extends SpawnOptions {
  /** Orchestrator reference (provides db, hooks, memory, tools, steering rules) */
  orchestrator: HarnessOrchestrator;
}

/**
 * Options for stopping an agent.
 */
export interface StopOptions {
  /** Remove the git worktree after stopping (default: false) */
  removeWorktree?: boolean;

  /** Also delete the branch when removing worktree (default: false) */
  deleteBranch?: boolean;
}

/** Metadata for a registered adapter (for UI display). */
export interface AdapterInfo {
  harness: string;
  displayName: string;
  icon: string;
}
