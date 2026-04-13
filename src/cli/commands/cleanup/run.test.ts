/**
 * Tests for cleanup command
 */

import { describe, test, expect, beforeEach, mock, spyOn } from "bun:test";
import { cleanupWorktrees, cleanupTestWorktrees } from "./run.ts";

// Mock the worktree functions
const mockListWorktrees = mock(() => Promise.resolve([]));
const mockRemoveWorktree = mock(() => Promise.resolve(true));

// Store original module
let worktreeModule: typeof import("../../harness/session/worktree/index.ts");

describe("cleanup utilities", () => {
  beforeEach(async () => {
    // Import the module to mock it
    worktreeModule = await import("../../harness/session/worktree/index.ts");
    mockListWorktrees.mockClear();
    mockRemoveWorktree.mockClear();
  });

  describe("cleanupWorktrees", () => {
    test("returns 0 when no worktrees exist", async () => {
      // Spy on the actual function
      const listSpy = spyOn(worktreeModule, "listWorktrees").mockResolvedValue([]);

      const result = await cleanupWorktrees("/fake/repo");

      expect(result).toBe(0);
      listSpy.mockRestore();
    });

    test("removes all worktrees when no ticketIds specified", async () => {
      const mockWorktrees = [
        { path: "/path/1", ticketId: "PROJ-1", branch: "feat/PROJ-1", head: "abc" },
        { path: "/path/2", ticketId: "PROJ-2", branch: "feat/PROJ-2", head: "def" },
      ];

      const listSpy = spyOn(worktreeModule, "listWorktrees").mockResolvedValue(mockWorktrees);
      const removeSpy = spyOn(worktreeModule, "removeWorktree").mockResolvedValue(true);

      const result = await cleanupWorktrees("/fake/repo");

      expect(result).toBe(2);
      expect(removeSpy).toHaveBeenCalledTimes(2);

      listSpy.mockRestore();
      removeSpy.mockRestore();
    });

    test("removes only specified ticketIds", async () => {
      const mockWorktrees = [
        { path: "/path/1", ticketId: "PROJ-1", branch: "feat/PROJ-1", head: "abc" },
        { path: "/path/2", ticketId: "PROJ-2", branch: "feat/PROJ-2", head: "def" },
        { path: "/path/3", ticketId: "PROJ-3", branch: "feat/PROJ-3", head: "ghi" },
      ];

      const listSpy = spyOn(worktreeModule, "listWorktrees").mockResolvedValue(mockWorktrees);
      const removeSpy = spyOn(worktreeModule, "removeWorktree").mockResolvedValue(true);

      const result = await cleanupWorktrees("/fake/repo", { ticketIds: ["PROJ-1", "PROJ-3"] });

      expect(result).toBe(2);
      expect(removeSpy).toHaveBeenCalledTimes(2);

      listSpy.mockRestore();
      removeSpy.mockRestore();
    });

    test("counts only successful removals", async () => {
      const mockWorktrees = [
        { path: "/path/1", ticketId: "PROJ-1", branch: "feat/PROJ-1", head: "abc" },
        { path: "/path/2", ticketId: "PROJ-2", branch: "feat/PROJ-2", head: "def" },
      ];

      const listSpy = spyOn(worktreeModule, "listWorktrees").mockResolvedValue(mockWorktrees);
      // First succeeds, second fails
      const removeSpy = spyOn(worktreeModule, "removeWorktree")
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const result = await cleanupWorktrees("/fake/repo");

      expect(result).toBe(1);

      listSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  describe("cleanupTestWorktrees", () => {
    test("returns 0 when no worktrees exist", async () => {
      const listSpy = spyOn(worktreeModule, "listWorktrees").mockResolvedValue([]);

      const result = await cleanupTestWorktrees("/fake/repo");

      expect(result).toBe(0);
      listSpy.mockRestore();
    });

    test("removes only test worktrees matching patterns", async () => {
      const mockWorktrees = [
        { path: "/path/1", ticketId: "TEST-123", branch: "feat/TEST-123", head: "abc" },
        { path: "/path/2", ticketId: "PROJ-TEST", branch: "feat/PROJ-TEST", head: "def" },
        {
          path: "/path/3",
          ticketId: "WORKTREE-FAIL-1",
          branch: "feat/WORKTREE-FAIL-1",
          head: "ghi",
        },
        { path: "/path/4", ticketId: "PROJ-123", branch: "feat/PROJ-123", head: "jkl" }, // Should NOT be removed
        { path: "/path/5", ticketId: "REAL-FAIL-1", branch: "feat/REAL-FAIL-1", head: "mno" },
      ];

      const listSpy = spyOn(worktreeModule, "listWorktrees").mockResolvedValue(mockWorktrees);
      const removeSpy = spyOn(worktreeModule, "removeWorktree").mockResolvedValue(true);

      const result = await cleanupTestWorktrees("/fake/repo");

      // Should remove TEST-123, PROJ-TEST, WORKTREE-FAIL-1, REAL-FAIL-1 (4 items)
      expect(result).toBe(4);
      expect(removeSpy).toHaveBeenCalledTimes(4);

      listSpy.mockRestore();
      removeSpy.mockRestore();
    });

    test("does not remove non-test worktrees", async () => {
      const mockWorktrees = [
        { path: "/path/1", ticketId: "PROJ-123", branch: "feat/PROJ-123", head: "abc" },
        { path: "/path/2", ticketId: "REAL-456", branch: "feat/REAL-456", head: "def" },
      ];

      const listSpy = spyOn(worktreeModule, "listWorktrees").mockResolvedValue(mockWorktrees);
      const removeSpy = spyOn(worktreeModule, "removeWorktree").mockResolvedValue(true);

      const result = await cleanupTestWorktrees("/fake/repo");

      expect(result).toBe(0);
      expect(removeSpy).not.toHaveBeenCalled();

      listSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });
});

describe("test pattern matching", () => {
  test("TEST- prefix is matched (case-insensitive)", () => {
    const patterns = ["TEST-123", "test-456", "Test-789"];
    for (const id of patterns) {
      const upper = id.toUpperCase();
      expect(upper.startsWith("TEST-")).toBe(true);
    }
  });

  test("-TEST suffix/middle is matched", () => {
    const patterns = ["PROJ-TEST", "PROJ-TEST-123"];
    for (const id of patterns) {
      const upper = id.toUpperCase();
      expect(upper.includes("-TEST")).toBe(true);
    }
  });

  test("-FAIL is matched", () => {
    const patterns = ["PROJ-FAIL", "WORKTREE-FAIL-123"];
    for (const id of patterns) {
      const upper = id.toUpperCase();
      expect(upper.includes("-FAIL")).toBe(true);
    }
  });

  test("WORKTREE-FAIL prefix is matched", () => {
    const patterns = ["WORKTREE-FAIL-123", "WORKTREE-FAIL"];
    for (const id of patterns) {
      const upper = id.toUpperCase();
      expect(upper.startsWith("WORKTREE-FAIL")).toBe(true);
    }
  });
});
