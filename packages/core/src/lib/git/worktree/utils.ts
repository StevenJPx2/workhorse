/**
 * Git worktree utility functions.
 *
 * @module lib/git/worktree/utils
 */

import { basename, dirname, join } from "node:path";

import type { WorktreeInfo } from "./types.ts";
import { BRANCH_PREFIXES } from "./types.ts";

// fallow-ignore-next-line unused-type
export interface GitResult {
  success: boolean;
  output: string;
  error: string;
}

export async function execGit(args: string[], cwd?: string): Promise<GitResult> {
  try {
    const proc = Bun.spawn(args, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [output, error, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    return {
      success: exitCode === 0,
      output: output.trim(),
      error: error.trim(),
    };
  } catch (e) {
    return {
      success: false,
      output: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Build the worktree path from repo path and issue ID.
 * Pattern: `../{repoName}-worktrees/{sanitizedIssueId}`
 */
export function buildWorktreePath(repoPath: string, issueId: string): string {
  const cleanRepoPath = repoPath.replace(/\/$/, "");
  return join(
    dirname(cleanRepoPath),
    `${basename(cleanRepoPath)}-worktrees`,
    issueId.replace(/[/:.]/g, "-"),
  );
}

/**
 * Build branch name from issue ID and optional issue type.
 * Pattern: `{prefix}/{issueId}`
 */
export function buildBranchName(issueId: string, issueType?: string): string {
  return `${issueType ? BRANCH_PREFIXES[issueType] || "feat" : "feat"}/${issueId}`;
}

/**
 * Parse `git worktree list --porcelain` output into WorktreeInfo array.
 * Only includes worktrees that match our `-worktrees/` pattern.
 */
export function parseWorktreeList(output: string): WorktreeInfo[] {
  if (!output.trim()) return [];

  const worktrees: WorktreeInfo[] = [];
  const marker = "-worktrees/";

  for (const entry of output.trim().split("\n\n")) {
    if (!entry.trim()) continue;

    const lines = entry.split("\n");
    let path = "";
    let head = "";
    let branch = "";

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        path = line.slice(9);
      } else if (line.startsWith("HEAD ")) {
        head = line.slice(5);
      } else if (line.startsWith("branch ")) {
        branch = line.slice(7).replace("refs/heads/", "");
      }
    }

    // Only include worktrees matching our pattern
    // Use lastIndexOf to handle nested paths like ...@stevenjpx2/workhorse-worktrees/rewrite-worktrees/ISSUE
    const markerIdx = path.lastIndexOf(marker);
    if (path && markerIdx !== -1) {
      const issueId = path.slice(markerIdx + marker.length);
      worktrees.push({ path, branch, issueId, head });
    }
  }

  return worktrees;
}
