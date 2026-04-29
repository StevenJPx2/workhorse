/**
 * Type definitions for agent adapters.
 * @module workflow/orchestrator/types/adapter
 */

import type { SpawnOptions } from "./spawn.ts";

// Import type-only to avoid circular dependency at runtime
import type { HarnessOrchestrator } from "../orchestrator.ts";

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
