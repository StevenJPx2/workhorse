/**
 * Spawn options types.
 *
 * @module workflow/orchestrator/types/spawn
 */
import type { Issue } from "#db";

import type { AgentHarness } from "./adapter.ts";

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

// Note: StopOptions has been moved to agent.ts
