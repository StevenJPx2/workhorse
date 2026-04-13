/**
 * Cleanup implementation - Remove stale worktrees and test artifacts
 */

import * as p from "@clack/prompts";
import { listWorktrees, removeWorktree } from "#core/session/worktree/index.ts";
import { getGitRoot } from "#core/git/detect-rig.ts";

interface CleanupOptions {
  all: boolean;
  dryRun: boolean;
  force: boolean;
}

/**
 * Run the cleanup command
 */
export async function runCleanup(options: CleanupOptions): Promise<void> {
  const { all, dryRun } = options;

  p.intro("🧹 Jiratown Cleanup");

  // Detect the current repo
  const repoPath = await getGitRoot();
  if (!repoPath) {
    p.cancel("Not in a git repository");
    process.exit(1);
  }

  // List all worktrees
  const worktrees = await listWorktrees(repoPath);

  if (worktrees.length === 0) {
    p.outro("No worktrees to clean up");
    return;
  }

  p.log.info(`Found ${worktrees.length} worktree(s):`);
  for (const wt of worktrees) {
    p.log.message(`  • ${wt.ticketId} (${wt.branch}) at ${wt.path}`);
  }

  if (dryRun) {
    p.outro("Dry run - no changes made");
    return;
  }

  let toRemove: typeof worktrees = [];

  if (all) {
    toRemove = worktrees;
  } else {
    // Interactive selection
    const selected = await p.multiselect({
      message: "Select worktrees to remove",
      options: worktrees.map((wt) => ({
        value: wt.ticketId,
        label: `${wt.ticketId} (${wt.branch})`,
        hint: wt.path,
      })),
    });

    if (p.isCancel(selected)) {
      p.cancel("Cleanup cancelled");
      process.exit(0);
    }

    toRemove = worktrees.filter((wt) => (selected as string[]).includes(wt.ticketId));
  }

  if (toRemove.length === 0) {
    p.outro("No worktrees selected for removal");
    return;
  }

  // Confirm before removal (unless --all was specified)
  if (!all) {
    const confirm = await p.confirm({
      message: `Remove ${toRemove.length} worktree(s)?`,
    });

    if (!confirm || p.isCancel(confirm)) {
      p.cancel("Cleanup cancelled");
      process.exit(0);
    }
  }

  // Remove selected worktrees
  const spinner = p.spinner();
  spinner.start(`Removing ${toRemove.length} worktree(s)...`);

  let removed = 0;
  let failed = 0;

  for (const wt of toRemove) {
    const success = await removeWorktree(repoPath, wt.ticketId, true);
    if (success) {
      removed++;
    } else {
      failed++;
      p.log.error(`Failed to remove ${wt.ticketId}`);
    }
  }

  spinner.stop(`Removed ${removed} worktree(s)${failed > 0 ? `, ${failed} failed` : ""}`);

  p.outro("✨ Cleanup complete");
}

/**
 * Cleanup worktrees programmatically (for test cleanup)
 * Returns the number of worktrees removed
 */
export async function cleanupWorktrees(
  repoPath: string,
  options: { ticketIds?: string[] } = {},
): Promise<number> {
  const { ticketIds } = options;

  const worktrees = await listWorktrees(repoPath);
  if (worktrees.length === 0) {
    return 0;
  }

  const toRemove = ticketIds
    ? worktrees.filter((wt) => ticketIds.includes(wt.ticketId))
    : worktrees;

  let removed = 0;
  for (const wt of toRemove) {
    const success = await removeWorktree(repoPath, wt.ticketId, true);
    if (success) {
      removed++;
    }
  }

  return removed;
}

/**
 * Cleanup test worktrees - removes worktrees matching test ticket patterns
 * Test tickets are identified by:
 * - Ticket IDs starting with "TEST-"
 * - Ticket IDs containing "-TEST" or "-FAIL"
 */
export async function cleanupTestWorktrees(repoPath: string): Promise<number> {
  const worktrees = await listWorktrees(repoPath);

  const testWorktrees = worktrees.filter((wt) => {
    const id = wt.ticketId.toUpperCase();
    return (
      id.startsWith("TEST-") ||
      id.includes("-TEST") ||
      id.includes("-FAIL") ||
      id.startsWith("WORKTREE-FAIL")
    );
  });

  if (testWorktrees.length === 0) {
    return 0;
  }

  const ticketIds = testWorktrees.map((wt) => wt.ticketId);
  return cleanupWorktrees(repoPath, { ticketIds });
}
