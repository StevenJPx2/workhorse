/**
 * Tests for git worktree management
 */

import { describe, test, expect } from "bun:test";
import {
  Worktree,
  createWorktreePath,
  createBranchName,
  parseWorktreeList,
  buildGitCommand,
} from "./worktree.ts";

describe("createWorktreePath", () => {
  test("should create path relative to repo", () => {
    const path = createWorktreePath("/path/to/repo", "PROJ-123");
    expect(path).toBe("/path/to/repo-worktrees/PROJ-123");
  });

  test("should handle repo paths with trailing slash", () => {
    const path = createWorktreePath("/path/to/repo/", "PROJ-456");
    expect(path).toBe("/path/to/repo-worktrees/PROJ-456");
  });

  test("should sanitize ticket ID for path", () => {
    const path = createWorktreePath("/repo", "PROJ/123:test");
    expect(path).toBe("/repo-worktrees/PROJ-123-test");
  });
});

describe("createBranchName", () => {
  test("should create feature branch for Story", () => {
    const branch = createBranchName("PROJ-123", "Story");
    expect(branch).toBe("feat/PROJ-123");
  });

  test("should create fix branch for Bug", () => {
    const branch = createBranchName("PROJ-456", "Bug");
    expect(branch).toBe("fix/PROJ-456");
  });

  test("should create chore branch for Task", () => {
    const branch = createBranchName("PROJ-789", "Task");
    expect(branch).toBe("chore/PROJ-789");
  });

  test("should create chore branch for Sub-task", () => {
    const branch = createBranchName("PROJ-101", "Sub-task");
    expect(branch).toBe("chore/PROJ-101");
  });

  test("should default to feat for unknown types", () => {
    const branch = createBranchName("PROJ-111", "Epic");
    expect(branch).toBe("feat/PROJ-111");
  });

  test("should handle undefined issue type", () => {
    const branch = createBranchName("PROJ-222");
    expect(branch).toBe("feat/PROJ-222");
  });
});

describe("Worktree", () => {
  test("should define worktree structure", () => {
    const wt: Worktree = {
      path: "/path/to/worktree",
      branch: "feat/PROJ-123",
      ticketId: "PROJ-123",
      head: "abc123",
    };

    expect(wt.path).toBe("/path/to/worktree");
    expect(wt.branch).toBe("feat/PROJ-123");
    expect(wt.ticketId).toBe("PROJ-123");
    expect(wt.head).toBe("abc123");
  });
});

describe("parseWorktreeList", () => {
  test("should parse git worktree list --porcelain output", () => {
    const output = `worktree /path/to/main
HEAD abc123def456
branch refs/heads/main

worktree /path/to/repo-worktrees/PROJ-123
HEAD 789xyz
branch refs/heads/feat/PROJ-123

worktree /path/to/repo-worktrees/PROJ-456
HEAD 111aaa
branch refs/heads/fix/PROJ-456
`;

    const worktrees = parseWorktreeList(output, "-worktrees/");

    // Should only return worktrees in the -worktrees directory
    expect(worktrees).toHaveLength(2);
    expect(worktrees[0].path).toBe("/path/to/repo-worktrees/PROJ-123");
    expect(worktrees[0].branch).toBe("feat/PROJ-123");
    expect(worktrees[0].ticketId).toBe("PROJ-123");
    expect(worktrees[0].head).toBe("789xyz");

    expect(worktrees[1].ticketId).toBe("PROJ-456");
  });

  test("should handle empty output", () => {
    const worktrees = parseWorktreeList("", "-worktrees/");
    expect(worktrees).toHaveLength(0);
  });

  test("should handle detached HEAD", () => {
    const output = `worktree /path/to/repo-worktrees/PROJ-789
HEAD deadbeef
detached
`;

    const worktrees = parseWorktreeList(output, "-worktrees/");
    expect(worktrees).toHaveLength(1);
    expect(worktrees[0].branch).toBe(""); // No branch when detached
    expect(worktrees[0].head).toBe("deadbeef");
  });
});

describe("buildGitCommand", () => {
  test("should build worktree add command", () => {
    const cmd = buildGitCommand("worktree", "add", {
      path: "/path/to/worktree",
      branch: "feat/PROJ-123",
      newBranch: true,
    });

    expect(cmd).toContain("git");
    expect(cmd).toContain("worktree");
    expect(cmd).toContain("add");
    expect(cmd).toContain("-b");
    expect(cmd).toContain("feat/PROJ-123");
    expect(cmd).toContain("/path/to/worktree");
  });

  test("should build worktree add command for existing branch", () => {
    const cmd = buildGitCommand("worktree", "add", {
      path: "/path/to/worktree",
      branch: "feat/PROJ-123",
      newBranch: false,
    });

    expect(cmd).toContain("git");
    expect(cmd).toContain("worktree");
    expect(cmd).toContain("add");
    expect(cmd).not.toContain("-b");
    expect(cmd).toContain("/path/to/worktree");
    expect(cmd).toContain("feat/PROJ-123");
  });

  test("should build worktree remove command", () => {
    const cmd = buildGitCommand("worktree", "remove", {
      path: "/path/to/worktree",
      force: true,
    });

    expect(cmd).toContain("git");
    expect(cmd).toContain("worktree");
    expect(cmd).toContain("remove");
    expect(cmd).toContain("--force");
    expect(cmd).toContain("/path/to/worktree");
  });

  test("should build worktree list command", () => {
    const cmd = buildGitCommand("worktree", "list", { porcelain: true });

    expect(cmd).toContain("git");
    expect(cmd).toContain("worktree");
    expect(cmd).toContain("list");
    expect(cmd).toContain("--porcelain");
  });

  test("should build branch delete command", () => {
    const cmd = buildGitCommand("branch", "-D", {
      branch: "feat/PROJ-123",
    });

    expect(cmd).toContain("git");
    expect(cmd).toContain("branch");
    expect(cmd).toContain("-D");
    expect(cmd).toContain("feat/PROJ-123");
  });

  test("should build fetch command", () => {
    const cmd = buildGitCommand("fetch", "origin", {});

    expect(cmd).toContain("git");
    expect(cmd).toContain("fetch");
    expect(cmd).toContain("origin");
  });
});
