/**
 * Test utility for cleaning up worktrees created during tests
 *
 * Usage in test files:
 * ```ts
 * import { cleanupTestWorktreesAfterAll } from "../../test/cleanup-worktrees.ts";
 *
 * // At the top of your test file or describe block
 * cleanupTestWorktreesAfterAll();
 * ```
 *
 * Or for manual cleanup:
 * ```ts
 * import { cleanupTestWorktrees, trackTestWorktree } from "../../test/cleanup-worktrees.ts";
 *
 * // Track worktrees created in your test
 * trackTestWorktree("TEST-123");
 *
 * // In afterAll or afterEach
 * await cleanupTestWorktrees();
 * ```
 */

import { afterAll } from "bun:test";
import { listWorktrees, removeWorktree } from "#core/session/worktree/index.ts";
import { getGitRoot } from "#core/git/detect-rig.ts";

// Track worktrees created during tests for cleanup
const trackedWorktrees = new Set<string>();

/**
 * Track a worktree ticket ID for cleanup
 */
export function trackTestWorktree(ticketId: string): void {
  trackedWorktrees.add(ticketId);
}

/**
 * Test ticket ID patterns that should be cleaned up
 */
const TEST_PATTERNS = [
  /^TEST-/i, // TEST-123
  /-TEST/i, // PROJ-TEST, PROJ-TEST-123
  /-FAIL/i, // WORKTREE-FAIL-123, PROJ-FAIL
  /^WORKTREE-FAIL/i, // WORKTREE-FAIL-*
  /^MOCK-/i, // MOCK-123
  /^FAKE-/i, // FAKE-123
  /^SPAWN-/i, // SPAWN-FAIL-* from orchestrator tests
];

/**
 * Check if a ticket ID matches test patterns
 */
export function isTestWorktree(ticketId: string): boolean {
  // Check tracked worktrees
  if (trackedWorktrees.has(ticketId)) {
    return true;
  }

  // Check patterns
  return TEST_PATTERNS.some((pattern) => pattern.test(ticketId));
}

/**
 * Clean up test worktrees
 * Removes worktrees matching test patterns or explicitly tracked
 */
export async function cleanupTestWorktrees(): Promise<{ removed: string[]; failed: string[] }> {
  const removed: string[] = [];
  const failed: string[] = [];

  try {
    const repoPath = await getGitRoot();
    if (!repoPath) {
      return { removed, failed };
    }

    const worktrees = await listWorktrees(repoPath);

    for (const wt of worktrees) {
      if (isTestWorktree(wt.ticketId)) {
        const success = await removeWorktree(repoPath, wt.ticketId, true);
        if (success) {
          removed.push(wt.ticketId);
          trackedWorktrees.delete(wt.ticketId);
        } else {
          failed.push(wt.ticketId);
        }
      }
    }
  } catch (error) {
    // Silently fail - cleanup is best-effort
    console.error("Test worktree cleanup error:", error);
  }

  return { removed, failed };
}

/**
 * Register an afterAll hook to clean up test worktrees
 * Call this at the top of test files that may create worktrees
 */
export function cleanupTestWorktreesAfterAll(): void {
  afterAll(async () => {
    const { removed, failed } = await cleanupTestWorktrees();
    if (removed.length > 0) {
      console.log(`Cleaned up ${removed.length} test worktree(s): ${removed.join(", ")}`);
    }
    if (failed.length > 0) {
      console.warn(`Failed to clean up ${failed.length} test worktree(s): ${failed.join(", ")}`);
    }
  });
}

/**
 * Clear tracked worktrees (for testing the cleanup utility itself)
 */
export function clearTrackedWorktrees(): void {
  trackedWorktrees.clear();
}
