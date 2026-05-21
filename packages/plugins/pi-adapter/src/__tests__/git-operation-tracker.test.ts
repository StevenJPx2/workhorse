/**
 * Tests for git operation timeout tracking.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GitOperationTracker } from "../git-operation-tracker.ts";

describe("GitOperationTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("creates tracker with default timeout", () => {
      const tracker = new GitOperationTracker();
      expect(tracker).toBeDefined();
    });

    it("creates tracker with custom timeout", () => {
      const tracker = new GitOperationTracker(60_000);
      expect(tracker).toBeDefined();
    });
  });

  describe("checkCommand", () => {
    it("returns null for non-git commands", () => {
      const tracker = new GitOperationTracker();
      expect(tracker.checkCommand("npm install")).toBeNull();
      expect(tracker.checkCommand("ls -la")).toBeNull();
    });

    it("returns null for initial rebase command", () => {
      const tracker = new GitOperationTracker();
      expect(tracker.checkCommand("git rebase origin/main")).toBeNull();
    });

    it("returns null for initial merge command", () => {
      const tracker = new GitOperationTracker();
      expect(tracker.checkCommand("git merge feature-branch")).toBeNull();
    });

    it("returns null for initial cherry-pick command", () => {
      const tracker = new GitOperationTracker();
      expect(tracker.checkCommand("git cherry-pick abc123")).toBeNull();
    });

    it("returns null for continue commands within timeout", () => {
      const tracker = new GitOperationTracker(180_000); // 3 min

      tracker.checkCommand("git rebase origin/main");
      vi.advanceTimersByTime(60_000); // 1 minute

      expect(tracker.checkCommand("git checkout --theirs file.txt")).toBeNull();
      expect(tracker.checkCommand("git add file.txt")).toBeNull();
      expect(tracker.checkCommand("git rebase --continue")).toBeNull();
    });

    it("returns error for continue commands after timeout", () => {
      const tracker = new GitOperationTracker(180_000); // 3 min

      tracker.checkCommand("git rebase origin/main");
      vi.advanceTimersByTime(200_000); // 3+ minutes

      const error = tracker.checkCommand("git checkout --theirs file.txt");
      expect(error).not.toBeNull();
      expect(error).toContain("Git rebase operation timed out");
      expect(error).toContain("3 minutes");
    });

    it("tracks command count in error message", () => {
      const tracker = new GitOperationTracker(180_000);

      tracker.checkCommand("git rebase origin/main"); // 1
      tracker.checkCommand("git checkout --theirs a.txt"); // 2
      tracker.checkCommand("git add a.txt"); // 3
      tracker.checkCommand("git rebase --continue"); // 4

      vi.advanceTimersByTime(200_000);

      const error = tracker.checkCommand("git checkout --ours b.txt"); // 5 - triggers timeout
      expect(error).toContain("5 commands");
    });

    it("resets after timeout error", () => {
      const tracker = new GitOperationTracker(180_000);

      tracker.checkCommand("git rebase origin/main");
      vi.advanceTimersByTime(200_000);

      // First call after timeout returns error
      expect(tracker.checkCommand("git rebase --continue")).not.toBeNull();

      // Subsequent calls should work (new operation can start)
      expect(tracker.checkCommand("git status")).toBeNull();
      expect(tracker.checkCommand("git rebase origin/main")).toBeNull();
    });

    it("clears operation on abort", () => {
      const tracker = new GitOperationTracker(180_000);

      tracker.checkCommand("git rebase origin/main");
      tracker.checkCommand("git checkout --theirs file.txt");
      tracker.checkCommand("git rebase --abort"); // Clears operation

      vi.advanceTimersByTime(200_000);

      // Should not timeout because operation was aborted
      expect(tracker.checkCommand("git rebase --continue")).toBeNull();
    });
  });

  describe("reset", () => {
    it("clears the current operation", () => {
      const tracker = new GitOperationTracker(180_000);

      tracker.checkCommand("git rebase origin/main");
      vi.advanceTimersByTime(200_000);

      tracker.reset();

      // After reset, continue commands shouldn't trigger timeout
      expect(tracker.checkCommand("git rebase --continue")).toBeNull();
    });
  });

  describe("operation types", () => {
    it("correctly identifies rebase operations", () => {
      const tracker = new GitOperationTracker(180_000);
      tracker.checkCommand("git rebase origin/main");
      vi.advanceTimersByTime(200_000);

      const error = tracker.checkCommand("git rebase --continue");
      expect(error).toContain("Git rebase operation");
    });

    it("correctly identifies merge operations", () => {
      const tracker = new GitOperationTracker(180_000);
      tracker.checkCommand("git merge feature");
      vi.advanceTimersByTime(200_000);

      const error = tracker.checkCommand("git add .");
      expect(error).toContain("Git merge operation");
    });

    it("correctly identifies cherry-pick operations", () => {
      const tracker = new GitOperationTracker(180_000);
      tracker.checkCommand("git cherry-pick abc123");
      vi.advanceTimersByTime(200_000);

      const error = tracker.checkCommand("git cherry-pick --continue");
      expect(error).toContain("Git cherry-pick operation");
    });
  });

  describe("action instructions", () => {
    it("includes abort instruction", () => {
      const tracker = new GitOperationTracker(180_000);
      tracker.checkCommand("git rebase origin/main");
      vi.advanceTimersByTime(200_000);

      const error = tracker.checkCommand("git rebase --continue");
      expect(error).toContain("git rebase --abort");
    });

    it("includes escalate instruction", () => {
      const tracker = new GitOperationTracker(180_000);
      tracker.checkCommand("git rebase origin/main");
      vi.advanceTimersByTime(200_000);

      const error = tracker.checkCommand("git rebase --continue");
      expect(error).toContain("workhorse_escalate");
    });
  });
});
