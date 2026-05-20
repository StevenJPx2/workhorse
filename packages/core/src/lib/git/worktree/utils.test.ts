import { describe, expect, it } from "vitest";

import { buildBranchName, buildWorktreePath, parseWorktreeList } from "./utils.ts";

describe("buildWorktreePath", () => {
  it("builds path from repo path and issue ID", () => {
    const result = buildWorktreePath("/home/user/project", "PROJ-123");
    expect(result).toBe("/home/user/project-worktrees/PROJ-123");
  });

  it("sanitizes slashes and colons in issue ID", () => {
    const result = buildWorktreePath("/home/user/project", "owner/repo:123");
    expect(result).toBe("/home/user/project-worktrees/owner-repo-123");
  });

  it("handles trailing slash in repo path", () => {
    const result = buildWorktreePath("/home/user/project/", "PROJ-123");
    expect(result).toBe("/home/user/project-worktrees/PROJ-123");
  });

  it("handles colons in issue ID (GitHub-style)", () => {
    const result = buildWorktreePath("/repos/myrepo", "github:owner:repo:456");
    expect(result).toBe("/repos/myrepo-worktrees/github-owner-repo-456");
  });
});

describe("buildBranchName", () => {
  it("uses feat prefix by default", () => {
    expect(buildBranchName("PROJ-123")).toBe("feat/PROJ-123");
  });

  it("uses fix prefix for Bug issue type", () => {
    expect(buildBranchName("PROJ-123", "Bug")).toBe("fix/PROJ-123");
  });

  it("uses feat prefix for Story issue type", () => {
    expect(buildBranchName("PROJ-123", "Story")).toBe("feat/PROJ-123");
  });

  it("uses chore prefix for Task issue type", () => {
    expect(buildBranchName("PROJ-123", "Task")).toBe("chore/PROJ-123");
  });

  it("uses chore prefix for Sub-task type", () => {
    expect(buildBranchName("PROJ-123", "Sub-task")).toBe("chore/PROJ-123");
  });

  it("falls back to feat for unknown issue types", () => {
    expect(buildBranchName("PROJ-123", "UnknownType")).toBe("feat/PROJ-123");
  });
});

describe("parseWorktreeList", () => {
  it("parses porcelain output into WorktreeInfo array", () => {
    const output = `worktree /home/user/project
HEAD abc123
branch refs/heads/main

worktree /home/user/project-worktrees/PROJ-123
HEAD def456
branch refs/heads/feat/PROJ-123`;

    const result = parseWorktreeList(output);

    // Should only include worktrees matching our pattern
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: "/home/user/project-worktrees/PROJ-123",
      branch: "feat/PROJ-123",
      issueId: "PROJ-123",
      head: "def456",
    });
  });

  it("returns empty array for empty output", () => {
    expect(parseWorktreeList("")).toEqual([]);
    expect(parseWorktreeList("   ")).toEqual([]);
  });

  it("parses multiple worktrees", () => {
    const output = `worktree /repos/main-worktrees/ISSUE-1
HEAD aaa111
branch refs/heads/feat/ISSUE-1

worktree /repos/main-worktrees/ISSUE-2
HEAD bbb222
branch refs/heads/fix/ISSUE-2`;

    const result = parseWorktreeList(output);

    expect(result).toHaveLength(2);
    expect(result[0]?.issueId).toBe("ISSUE-1");
    expect(result[1]?.issueId).toBe("ISSUE-2");
  });

  it("handles detached HEAD worktrees", () => {
    const output = `worktree /repos/main-worktrees/DETACHED-1
HEAD ccc333
detached`;

    const result = parseWorktreeList(output);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: "/repos/main-worktrees/DETACHED-1",
      branch: "",
      issueId: "DETACHED-1",
      head: "ccc333",
    });
  });
});
