/**
 * Git worktree types.
 *
 * @module lib/git/worktree/types
 */

export interface WorktreeInfo {
  /** Absolute path to the worktree directory */
  path: string;
  /** Branch name (e.g., "feat/PROJ-123") */
  branch: string;
  /** Issue ID extracted from path */
  issueId: string;
  /** Git HEAD commit SHA */
  head: string;
}

/** Maps Jira issue types to branch prefixes */
export const BRANCH_PREFIXES: Record<string, string> = {
  Story: "feat",
  Bug: "fix",
  Task: "chore",
  "Sub-task": "chore",
  Epic: "feat",
  Improvement: "feat",
};
