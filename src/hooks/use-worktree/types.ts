/**
 * Types for useWorktree hook
 */

import type { Accessor } from "solid-js";
import type { Worktree } from "../../harness/session/worktree/index.ts";

/**
 * Options for useWorktree hook
 */
export interface UseWorktreeOptions {
  /** Repository path (required for worktree operations) */
  repoPath?: string;
  /** Whether to auto-load worktrees on mount */
  autoLoad?: boolean;
  /** Callback when worktrees change */
  onChange?: (worktrees: Worktree[]) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

/**
 * Return value from useWorktree hook
 */
export interface UseWorktreeReturn {
  /** List of Jiratown-managed worktrees */
  worktrees: Accessor<Worktree[]>;
  /** Loading state */
  isLoading: Accessor<boolean>;
  /** Last error if any */
  error: Accessor<Error | null>;
  /** Reload worktrees from git */
  reload: () => Promise<void>;
  /** Create a new worktree */
  create: (
    ticketId: string,
    issueType?: string,
    baseBranch?: string
  ) => Promise<Worktree | null>;
  /** Remove a worktree */
  remove: (ticketId: string, deleteBranch?: boolean) => Promise<boolean>;
  /** Check if worktree exists */
  exists: (ticketId: string) => Promise<boolean>;
  /** Get a specific worktree */
  get: (ticketId: string) => Promise<Worktree | null>;
}
