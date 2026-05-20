/**
 * Git worktree operations.
 *
 * @module lib/git/worktree/operations
 */

import { existsSync } from "node:fs";

import type { WorktreeInfo } from "./types.ts";
import { buildBranchName, buildWorktreePath, execGit, parseWorktreeList } from "./utils.ts";

/**
 * Sync an existing worktree branch with the latest commits from its parent branch.
 *
 * Fetches from origin then merges `origin/{baseBranch}` into the worktree's current
 * branch. If the merge produces conflicts the worktree is left in a conflicted state
 * and the function returns `false` so callers can surface the error to the user.
 *
 * @param repoPath  - Path to the main git repository
 * @param worktreePath - Path to the existing worktree
 * @param baseBranch - Parent branch to pull from (default: "main")
 * @returns true if sync succeeded (including already up-to-date), false on failure
 */
export async function syncWorktree(
  repoPath: string,
  worktreePath: string,
  baseBranch: string = "main",
): Promise<boolean> {
  // Fetch latest from origin
  const fetchResult = await execGit(["git", "fetch", "origin"], repoPath);
  if (!fetchResult.success) {
    console.error(`Failed to fetch from origin: ${fetchResult.error}`);
    return false;
  }

  // Merge parent branch into the worktree branch (fast-forward when possible)
  if (
    await execGit(["git", "merge", "--ff-only", `origin/${baseBranch}`], worktreePath).then(
      (r) => r.success,
    )
  ) {
    return true;
  }

  // Fast-forward failed — branches have diverged, fall back to a regular merge
  const mergeNoFfResult = await execGit(
    ["git", "merge", `origin/${baseBranch}`, "--no-edit"],
    worktreePath,
  );

  if (!mergeNoFfResult.success) {
    console.error(
      `Failed to sync worktree at ${worktreePath} with origin/${baseBranch}: ${mergeNoFfResult.error}`,
    );
    return false;
  }

  return true;
}

/**
 * Create a git worktree for the given issue.
 *
 * If a worktree already exists for this issue, syncs it with the latest commits
 * from the parent branch and returns it.
 * Creates a new branch from the base branch if one doesn't exist.
 *
 * @param repoPath - Path to the main git repository
 * @param issueId - Issue identifier (e.g., "PROJ-123")
 * @param issueType - Optional issue type for branch prefix (Story, Bug, Task, etc.)
 * @param baseBranch - Branch to create worktree from (default: "main")
 * @returns WorktreeInfo or null if creation failed
 */
export async function createWorktree(
  repoPath: string,
  issueId: string,
  issueType?: string,
  baseBranch: string = "main",
): Promise<WorktreeInfo | null> {
  const worktreePath = buildWorktreePath(repoPath, issueId);
  const branchName = buildBranchName(issueId, issueType);

  // Check if worktree already exists in git's records
  const existing = await getWorktree(repoPath, issueId);
  if (existing) {
    // Verify the path actually exists on disk
    if (existsSync(existing.path)) {
      // Sync the branch with the latest from the parent before handing it to the agent
      await syncWorktree(repoPath, existing.path, baseBranch);
      return existing;
    }
    // Worktree is registered but path doesn't exist on disk - prune the stale reference
    // (this only removes git's metadata, not any files)
    await execGit(["git", "worktree", "prune"], repoPath);
  }

  // If directory exists on disk but isn't registered with git, it's orphaned
  // Don't delete it - could contain uncommitted work. Fail with clear error.
  if (existsSync(worktreePath)) {
    console.error(
      `Worktree directory exists but is not registered with git: ${worktreePath}\n` +
        `This may contain uncommitted work. Please manually remove or repair it:\n` +
        `  - To remove: rm -rf "${worktreePath}"\n` +
        `  - To repair: git worktree repair "${worktreePath}"`,
    );
    return null;
  }

  // Fetch latest from origin
  await execGit(["git", "fetch", "origin"], repoPath);

  // Try to create worktree with new branch
  if (
    !(await execGit(
      ["git", "worktree", "add", "-b", branchName, worktreePath, `origin/${baseBranch}`],
      repoPath,
    ).then((r) => r.success))
  ) {
    // Branch might already exist, try without -b flag
    const existingBranchResult = await execGit(
      ["git", "worktree", "add", worktreePath, branchName],
      repoPath,
    );

    if (!existingBranchResult.success) {
      console.error(`Failed to create worktree: ${existingBranchResult.error}`);
      return null;
    }
  }

  // Get HEAD commit
  const headResult = await execGit(["git", "rev-parse", "HEAD"], worktreePath);

  return {
    path: worktreePath,
    branch: branchName,
    issueId,
    head: headResult.success ? headResult.output : "",
  };
}

/**
 * Get worktree info for a specific issue.
 * Used by createWorktree and removeWorktree.
 */
// oxlint-disable-next-line workhorse/no-single-reference-function
async function getWorktree(repoPath: string, issueId: string): Promise<WorktreeInfo | null> {
  const result = await execGit(["git", "worktree", "list", "--porcelain"], repoPath);
  return (
    (result.success ? parseWorktreeList(result.output) : []).find((wt) => wt.issueId === issueId) ||
    null
  );
}

/**
 * Remove a worktree for the given issue.
 *
 * @param repoPath - Path to the main git repository
 * @param issueId - Issue identifier
 * @param deleteBranch - Also delete the associated branch (default: false)
 * @returns true if removal succeeded
 */
export async function removeWorktree(
  repoPath: string,
  issueId: string,
  deleteBranch: boolean = false,
): Promise<boolean> {
  const worktree = await getWorktree(repoPath, issueId);
  if (!worktree) {
    return false;
  }

  // Remove the worktree
  const removeResult = await execGit(
    ["git", "worktree", "remove", "--force", worktree.path],
    repoPath,
  );

  if (!removeResult.success) {
    console.error(`Failed to remove worktree: ${removeResult.error}`);
    return false;
  }

  // Optionally delete the branch
  if (deleteBranch && worktree.branch) {
    await execGit(["git", "branch", "-D", worktree.branch], repoPath);
  }

  return true;
}
