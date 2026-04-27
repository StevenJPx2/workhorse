/**
 * Spawn options types.
 *
 * @module workflow/orchestrator/types/spawn
 */

import type { Issue } from "#db";
import type { AgentHarness } from "./agent.ts";

/**
 * Options for spawning a new agent.
 */
export interface SpawnOptions {
  /** Issue to work on */
  issue: Issue;

  /** Custom prompt override (skips PromptEngineer if provided) */
  prompt?: string;

  /** Harness to use (default: "pi-coding-agent") */
  harness?: AgentHarness;

  /** Model to use (passed to harness) */
  model?: string;

  /** Path to the main git repository */
  repoPath: string;

  /** Branch to create worktree from (default: "main") */
  baseBranch?: string;
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
