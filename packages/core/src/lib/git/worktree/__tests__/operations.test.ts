/**
 * Tests for git worktree operations.
 *
 * createWorktree and syncWorktree are tested with mocked execGit and existsSync
 * so no real git repository is needed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------- module mocks (hoisted) ----------------------------------------

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("../utils.ts", async (importOriginal) => {
  // Keep the pure helpers (buildBranchName, buildWorktreePath, parseWorktreeList)
  // but replace execGit with a controllable spy.
  const actual = await importOriginal<typeof import("../utils.ts")>();
  return {
    ...actual,
    execGit: vi.fn(),
  };
});

// ---------- imports (after mocks are hoisted) ------------------------------

import { existsSync } from "node:fs";

import { createWorktree, removeWorktree, syncWorktree } from "../operations.ts";
import { execGit } from "../utils.ts";

// ---------- helpers --------------------------------------------------------

const mockExistsSync = vi.mocked(existsSync);
const mockExecGit = vi.mocked(execGit);

function ok(output = ""): Awaited<ReturnType<typeof execGit>> {
  return { success: true, output, error: "" };
}

function fail(error = "git error"): Awaited<ReturnType<typeof execGit>> {
  return { success: false, output: "", error };
}

/** Minimal porcelain output for a single matching worktree */
function porcelainEntry(path: string, branch: string, head = "abc123"): string {
  return `worktree ${path}\nHEAD ${head}\nbranch refs/heads/${branch}`;
}

// ---------- syncWorktree ---------------------------------------------------

describe("syncWorktree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when fetch + fast-forward merge both succeed", async () => {
    mockExecGit
      .mockResolvedValueOnce(ok()) // fetch
      .mockResolvedValueOnce(ok("Already up to date.")); // ff merge

    const result = await syncWorktree(
      "/repo",
      "/repo-worktrees/PROJ-123",
      "main",
    );

    expect(result).toBe(true);
    expect(mockExecGit).toHaveBeenCalledWith(
      ["git", "fetch", "origin"],
      "/repo",
    );
    expect(mockExecGit).toHaveBeenCalledWith(
      ["git", "merge", "--ff-only", "origin/main"],
      "/repo-worktrees/PROJ-123",
    );
  });

  it("falls back to regular merge when ff-only fails", async () => {
    mockExecGit
      .mockResolvedValueOnce(ok()) // fetch
      .mockResolvedValueOnce(fail("fatal: Not possible to fast-forward")) // ff merge fails
      .mockResolvedValueOnce(ok("Merge made by the 'ort' strategy.")); // regular merge

    const result = await syncWorktree(
      "/repo",
      "/repo-worktrees/PROJ-123",
      "main",
    );

    expect(result).toBe(true);
    expect(mockExecGit).toHaveBeenCalledWith(
      ["git", "merge", "origin/main", "--no-edit"],
      "/repo-worktrees/PROJ-123",
    );
  });

  it("returns false and logs when fetch fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockExecGit.mockResolvedValueOnce(fail("network error")); // fetch fails

    const result = await syncWorktree(
      "/repo",
      "/repo-worktrees/PROJ-123",
      "main",
    );

    expect(result).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to fetch from origin"),
    );
    errorSpy.mockRestore();
  });

  it("returns false and logs when both merge strategies fail (conflict)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockExecGit
      .mockResolvedValueOnce(ok()) // fetch
      .mockResolvedValueOnce(fail()) // ff merge fails
      .mockResolvedValueOnce(fail("CONFLICT")); // regular merge fails

    const result = await syncWorktree(
      "/repo",
      "/repo-worktrees/PROJ-123",
      "main",
    );

    expect(result).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to sync worktree"),
    );
    errorSpy.mockRestore();
  });

  it("uses provided baseBranch in merge commands", async () => {
    mockExecGit
      .mockResolvedValueOnce(ok()) // fetch
      .mockResolvedValueOnce(ok()); // ff merge

    await syncWorktree("/repo", "/repo-worktrees/PROJ-123", "develop");

    expect(mockExecGit).toHaveBeenCalledWith(
      ["git", "merge", "--ff-only", "origin/develop"],
      "/repo-worktrees/PROJ-123",
    );
  });

  it("defaults baseBranch to main", async () => {
    mockExecGit
      .mockResolvedValueOnce(ok()) // fetch
      .mockResolvedValueOnce(ok()); // ff merge

    await syncWorktree("/repo", "/repo-worktrees/PROJ-123");

    expect(mockExecGit).toHaveBeenCalledWith(
      ["git", "merge", "--ff-only", "origin/main"],
      "/repo-worktrees/PROJ-123",
    );
  });
});

// ---------- createWorktree — existing worktree path ------------------------

describe("createWorktree — existing worktree", () => {
  const repoPath = "/home/user/project";
  const worktreePath = "/home/user/project-worktrees/PROJ-123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs and returns existing worktree when path exists on disk", async () => {
    // getWorktree: worktree list returns a matching entry
    mockExecGit.mockResolvedValueOnce(
      ok(porcelainEntry(worktreePath, "feat/PROJ-123")),
    ); // git worktree list
    mockExistsSync.mockReturnValue(true); // path exists on disk

    // syncWorktree calls: fetch + ff merge
    mockExecGit
      .mockResolvedValueOnce(ok()) // fetch
      .mockResolvedValueOnce(ok("Already up to date.")); // ff merge

    const result = await createWorktree(
      repoPath,
      "PROJ-123",
      undefined,
      "main",
    );

    expect(result).not.toBeNull();
    expect(result?.path).toBe(worktreePath);
    expect(result?.branch).toBe("feat/PROJ-123");
    expect(result?.issueId).toBe("PROJ-123");

    // fetch should have been called as part of syncWorktree
    expect(mockExecGit).toHaveBeenCalledWith(
      ["git", "fetch", "origin"],
      repoPath,
    );
    // merge should target the existing worktree directory
    expect(mockExecGit).toHaveBeenCalledWith(
      ["git", "merge", "--ff-only", "origin/main"],
      worktreePath,
    );
  });

  it("continues (doesn't abort) even if sync fails for existing worktree", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockExecGit.mockResolvedValueOnce(
      ok(porcelainEntry(worktreePath, "feat/PROJ-123")),
    ); // git worktree list
    mockExistsSync.mockReturnValue(true);

    // syncWorktree: fetch fails
    mockExecGit.mockResolvedValueOnce(fail("network error")); // fetch

    const result = await createWorktree(
      repoPath,
      "PROJ-123",
      undefined,
      "main",
    );

    // createWorktree still returns the existing worktree even if sync failed
    expect(result).not.toBeNull();
    expect(result?.path).toBe(worktreePath);

    errorSpy.mockRestore();
  });

  it("prunes stale git record and creates fresh worktree when path is missing on disk", async () => {
    // getWorktree: stale record exists
    mockExecGit.mockResolvedValueOnce(
      ok(porcelainEntry(worktreePath, "feat/PROJ-123")),
    ); // git worktree list
    // existsSync: path NOT on disk
    mockExistsSync
      .mockReturnValueOnce(false) // existing.path check (prune path)
      .mockReturnValueOnce(false); // orphan check for worktreePath

    mockExecGit
      .mockResolvedValueOnce(ok()) // git worktree prune
      .mockResolvedValueOnce(ok()) // git fetch origin
      .mockResolvedValueOnce(ok()) // git worktree add -b
      .mockResolvedValueOnce(ok("deadbeef")); // git rev-parse HEAD

    const result = await createWorktree(
      repoPath,
      "PROJ-123",
      undefined,
      "main",
    );

    expect(result).not.toBeNull();
    expect(mockExecGit).toHaveBeenCalledWith(
      ["git", "worktree", "prune"],
      repoPath,
    );
    expect(mockExecGit).toHaveBeenCalledWith(
      ["git", "fetch", "origin"],
      repoPath,
    );
  });
});

// ---------- createWorktree — new worktree ----------------------------------

describe("createWorktree — new worktree", () => {
  const repoPath = "/home/user/project";
  const worktreePath = "/home/user/project-worktrees/PROJ-456";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new worktree when none exists", async () => {
    mockExecGit.mockResolvedValueOnce(ok("")); // git worktree list (empty)
    mockExistsSync.mockReturnValue(false); // directory doesn't exist

    mockExecGit
      .mockResolvedValueOnce(ok()) // git fetch origin
      .mockResolvedValueOnce(ok()) // git worktree add -b
      .mockResolvedValueOnce(ok("cafebabe")); // git rev-parse HEAD

    const result = await createWorktree(repoPath, "PROJ-456", "Bug", "main");

    expect(result).not.toBeNull();
    expect(result?.branch).toBe("fix/PROJ-456");
    expect(result?.head).toBe("cafebabe");
    expect(mockExecGit).toHaveBeenCalledWith(
      [
        "git",
        "worktree",
        "add",
        "-b",
        "fix/PROJ-456",
        worktreePath,
        "origin/main",
      ],
      repoPath,
    );
  });

  it("falls back to checkout of existing branch when -b fails", async () => {
    mockExecGit.mockResolvedValueOnce(ok("")); // git worktree list (empty)
    mockExistsSync.mockReturnValue(false);

    mockExecGit
      .mockResolvedValueOnce(ok()) // git fetch origin
      .mockResolvedValueOnce(fail("branch already exists")) // git worktree add -b fails
      .mockResolvedValueOnce(ok()) // git worktree add (without -b)
      .mockResolvedValueOnce(ok("1a2b3c4d")); // git rev-parse HEAD

    const result = await createWorktree(
      repoPath,
      "PROJ-456",
      undefined,
      "main",
    );

    expect(result).not.toBeNull();
    expect(mockExecGit).toHaveBeenCalledWith(
      ["git", "worktree", "add", worktreePath, "feat/PROJ-456"],
      repoPath,
    );
  });

  it("returns null when both worktree-add strategies fail", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockExecGit.mockResolvedValueOnce(ok("")); // git worktree list (empty)
    mockExistsSync.mockReturnValue(false);

    mockExecGit
      .mockResolvedValueOnce(ok()) // git fetch
      .mockResolvedValueOnce(fail("cannot create")) // git worktree add -b fails
      .mockResolvedValueOnce(fail("also fails")); // git worktree add without -b fails

    const result = await createWorktree(
      repoPath,
      "PROJ-456",
      undefined,
      "main",
    );

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to create worktree"),
    );
    errorSpy.mockRestore();
  });

  it("returns null when orphaned directory exists on disk", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockExecGit.mockResolvedValueOnce(ok("")); // git worktree list (empty, no git record)
    // Orphaned directory on disk
    mockExistsSync.mockReturnValue(true);

    const result = await createWorktree(
      repoPath,
      "PROJ-456",
      undefined,
      "main",
    );

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Worktree directory exists but is not registered with git",
      ),
    );
    errorSpy.mockRestore();
  });
});

// ---------- removeWorktree -------------------------------------------------

describe("removeWorktree", () => {
  const repoPath = "/home/user/project";
  const worktreePath = "/home/user/project-worktrees/PROJ-123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes an existing worktree", async () => {
    mockExecGit
      .mockResolvedValueOnce(ok(porcelainEntry(worktreePath, "feat/PROJ-123"))) // list
      .mockResolvedValueOnce(ok()); // remove

    const result = await removeWorktree(repoPath, "PROJ-123");

    expect(result).toBe(true);
    expect(mockExecGit).toHaveBeenCalledWith(
      ["git", "worktree", "remove", "--force", worktreePath],
      repoPath,
    );
  });

  it("returns false when no worktree found", async () => {
    mockExecGit.mockResolvedValueOnce(ok("")); // empty list

    const result = await removeWorktree(repoPath, "PROJ-999");

    expect(result).toBe(false);
  });

  it("deletes branch when deleteBranch=true", async () => {
    mockExecGit
      .mockResolvedValueOnce(ok(porcelainEntry(worktreePath, "feat/PROJ-123"))) // list
      .mockResolvedValueOnce(ok()) // remove
      .mockResolvedValueOnce(ok()); // branch -D

    const result = await removeWorktree(repoPath, "PROJ-123", true);

    expect(result).toBe(true);
    expect(mockExecGit).toHaveBeenCalledWith(
      ["git", "branch", "-D", "feat/PROJ-123"],
      repoPath,
    );
  });

  it("returns false and logs when remove fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockExecGit
      .mockResolvedValueOnce(ok(porcelainEntry(worktreePath, "feat/PROJ-123"))) // list
      .mockResolvedValueOnce(fail("permission denied")); // remove

    const result = await removeWorktree(repoPath, "PROJ-123");

    expect(result).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to remove worktree"),
    );
    errorSpy.mockRestore();
  });
});
