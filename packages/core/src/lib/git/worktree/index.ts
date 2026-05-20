/**
 * Git worktree utilities for managing isolated working directories per issue.
 *
 * Worktrees are created in a sibling directory: `../{repo}-worktrees/{issueId}`
 * Branch naming follows: `{prefix}/{issueId}` where prefix is feat/fix/chore based on issue type.
 *
 * @module lib/git/worktree
 */

// Operations
export { createWorktree, removeWorktree, syncWorktree } from "./operations.ts";
