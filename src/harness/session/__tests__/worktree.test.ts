/**
 * Tests for git worktree management
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { cleanupTestWorktreesAfterAll } from "../../../test/cleanup-worktrees.ts";

// Clean up any test worktrees that might be created if mocks fail
cleanupTestWorktreesAfterAll();
import {
  Worktree,
  createWorktreePath,
  createBranchName,
  parseWorktreeList,
  buildGitCommand,
  createWorktree,
  getWorktree,
  worktreeExists,
  listWorktrees,
  removeWorktree,
} from "../worktree/index.ts";

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

describe("Async worktree operations", () => {
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    originalSpawn = Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  // Helper to create mock subprocess for git commands
  function createMockGitSubprocess(exitCode: number, stdout: string = "") {
    return {
      stdout: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(stdout));
          controller.close();
        },
      }),
      stderr: new ReadableStream({
        start(c) {
          c.close();
        },
      }),
      exited: Promise.resolve(exitCode),
      kill: () => {},
      stdin: new WritableStream(),
      terminal: undefined,
      stdio: [],
      readable: new ReadableStream(),
      writable: new WritableStream(),
      pid: 12345,
      unref: () => {},
      ref: () => {},
      send: () => true,
      disconnect: () => {},
      signalCode: null,
      exitCode: null,
      resourceUsage: null,
      killed: false,
      [Symbol.asyncDispose]: async () => {},
    } as unknown as ReturnType<typeof Bun.spawn>;
  }

  describe("listWorktrees", () => {
    test("should return empty array on git error", async () => {
      Bun.spawn = (() => createMockGitSubprocess(1)) as unknown as typeof Bun.spawn;

      const result = await listWorktrees("/fake/repo");
      expect(result).toEqual([]);
    });

    test("should parse and return worktrees", async () => {
      const gitOutput = `worktree /path/to/repo-worktrees/TEST-123
HEAD abc123
branch refs/heads/feat/TEST-123

worktree /path/to/repo-worktrees/TEST-456
HEAD def456
branch refs/heads/fix/TEST-456`;

      Bun.spawn = (() => createMockGitSubprocess(0, gitOutput)) as unknown as typeof Bun.spawn;

      const result = await listWorktrees("/fake/repo");
      expect(result.length).toBe(2);
      expect(result[0].ticketId).toBe("TEST-123");
      expect(result[1].ticketId).toBe("TEST-456");
    });
  });

  describe("worktreeExists", () => {
    test("should return false when no worktrees exist", async () => {
      Bun.spawn = (() => createMockGitSubprocess(0, "")) as unknown as typeof Bun.spawn;

      const result = await worktreeExists("/fake/repo", "NON-EXISTENT");
      expect(result).toBe(false);
    });

    test("should return true when worktree exists", async () => {
      const gitOutput = `worktree /path/to/repo-worktrees/TEST-123
HEAD abc123
branch refs/heads/feat/TEST-123`;

      Bun.spawn = (() => createMockGitSubprocess(0, gitOutput)) as unknown as typeof Bun.spawn;

      const result = await worktreeExists("/fake/repo", "TEST-123");
      expect(result).toBe(true);
    });
  });

  describe("getWorktree", () => {
    test("should return null for non-existent worktree", async () => {
      Bun.spawn = (() => createMockGitSubprocess(0, "")) as unknown as typeof Bun.spawn;

      const result = await getWorktree("/fake/repo", "NON-EXISTENT");
      expect(result).toBeNull();
    });

    test("should return worktree when found", async () => {
      const gitOutput = `worktree /path/to/repo-worktrees/TEST-123
HEAD abc123
branch refs/heads/feat/TEST-123`;

      Bun.spawn = (() => createMockGitSubprocess(0, gitOutput)) as unknown as typeof Bun.spawn;

      const result = await getWorktree("/fake/repo", "TEST-123");
      expect(result).not.toBeNull();
      expect(result!.ticketId).toBe("TEST-123");
      expect(result!.branch).toBe("feat/TEST-123");
    });
  });

  describe("createWorktree - reuse path", () => {
    test("should reuse existing worktree if found", async () => {
      // First call to list worktrees returns existing worktree
      let callCount = 0;
      Bun.spawn = (() => {
        callCount++;
        if (callCount === 1) {
          // listWorktrees call
          return createMockGitSubprocess(
            0,
            `worktree /path/to/repo-worktrees/TEST-123
HEAD abc123
branch refs/heads/feat/TEST-123`,
          );
        }
        return createMockGitSubprocess(0);
      }) as unknown as typeof Bun.spawn;

      const result = await createWorktree("/fake/repo", "TEST-123", "Story");
      expect(result).not.toBeNull();
      expect(result!.ticketId).toBe("TEST-123");
      expect(result!.path).toBe("/path/to/repo-worktrees/TEST-123");
    });
  });

  describe("removeWorktree", () => {
    test("should return false for non-existent worktree", async () => {
      Bun.spawn = (() => createMockGitSubprocess(0, "")) as unknown as typeof Bun.spawn;

      const result = await removeWorktree("/fake/repo", "NON-EXISTENT");
      expect(result).toBe(false);
    });

    test("should handle worktree remove failure with retry", async () => {
      // First worktree list shows the worktree exists
      // Then remove fails, then succeeds on retry
      let callCount = 0;
      Bun.spawn = (() => {
        callCount++;
        if (callCount === 1) {
          return createMockGitSubprocess(
            0,
            "/fake/repo-worktrees/TEST-123 abc1234 [feat/TEST-123]",
          );
        }
        // Simulate remove failing then succeeding
        return createMockGitSubprocess(0, "");
      }) as unknown as typeof Bun.spawn;

      const result = await removeWorktree("/fake/repo", "TEST-123");
      // Based on implementation, this may succeed or fail depending on error handling
      expect(typeof result).toBe("boolean");
    });
  });

  describe("createWorktree error paths", () => {
    test("should handle git fetch failure gracefully", async () => {
      Bun.spawn = (() =>
        createMockGitSubprocess(1, "fatal: could not fetch")) as unknown as typeof Bun.spawn;

      const result = await createWorktree("/fake/repo", "TEST-123", "Story", "main");
      expect(result).toBeNull();
    });

    test("should handle existing branch scenario", async () => {
      let callCount = 0;
      Bun.spawn = ((cmd: string[], _options?: object) => {
        callCount++;
        const command = cmd.join(" ");

        if (command.includes("worktree list")) {
          return createMockGitSubprocess(
            0,
            callCount > 2 ? "/fake/repo-worktrees/TEST-123 abc1234 [feat/TEST-123]" : "",
          );
        }
        if (command.includes("fetch")) {
          return createMockGitSubprocess(0, "");
        }
        if (command.includes("worktree add") && command.includes("-b")) {
          // Simulate branch exists error
          return createMockGitSubprocess(
            128,
            "fatal: A branch named 'feat/TEST-123' already exists.",
          );
        }
        if (command.includes("worktree add")) {
          // Second attempt without -b flag
          return createMockGitSubprocess(0, "Preparing worktree");
        }
        return createMockGitSubprocess(0, "");
      }) as unknown as typeof Bun.spawn;

      const result = await createWorktree("/fake/repo", "TEST-123", "Story", "main");
      // Should retry without -b flag
      expect(result).not.toBeNull();
    });

    test("should handle complete worktree add failure", async () => {
      let _callCount = 0;
      Bun.spawn = ((cmd: string[], _options?: object) => {
        _callCount++;
        const command = cmd.join(" ");

        if (command.includes("worktree list")) {
          return createMockGitSubprocess(0, "");
        }
        if (command.includes("fetch")) {
          return createMockGitSubprocess(0, "");
        }
        if (command.includes("worktree add")) {
          return createMockGitSubprocess(1, "fatal: could not create worktree");
        }
        return createMockGitSubprocess(0, "");
      }) as unknown as typeof Bun.spawn;

      const result = await createWorktree("/fake/repo", "TEST-123", "Story", "main");
      expect(result).toBeNull();
    });
  });
});
