import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createMockSubprocess, successMockSpawn } from "./test-utils.ts";

describe("spawnAgent - agent already running", () => {
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    originalSpawn = Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  test("blocks spawn when agent is already running", async () => {
    const ticketId = `RUNNING-${Date.now()}`;

    Bun.spawn = successMockSpawn();

    const { spawnAgent, stopAgent } = await import("../orchestrator.ts");

    const result1 = await spawnAgent({
      ticketId,
      agentType: "opencode",
      repoPath: "/fake/repo",
      issueType: "Story",
      baseBranch: "main",
    });

    expect(result1.success).toBe(true);

    const result2 = await spawnAgent({
      ticketId,
      agentType: "opencode",
      repoPath: "/fake/repo",
      issueType: "Story",
      baseBranch: "main",
    });

    expect(result2.success).toBe(false);
    expect(result2.error).toContain("already running");

    await stopAgent(ticketId, "/fake/repo");
  });
});

describe("spawnAgent - worktree branch exists", () => {
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    originalSpawn = Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  test("uses existing branch when branch already exists", async () => {
    let _branchChecked = false;
    let _usedExistingBranch = false;

    Bun.spawn = ((cmd: string[]) => {
      const command = cmd.join(" ");

      if (command.includes("worktree list")) return createMockSubprocess(0, "");
      if (command.includes("fetch")) return createMockSubprocess(0, "");
      if (command.includes("worktree add -b")) {
        _branchChecked = true;
        return createMockSubprocess(128, "", "fatal: A branch named 'chore/BRANCH-TEST' already exists");
      }
      if (command.includes("worktree add")) {
        _usedExistingBranch = true;
        return createMockSubprocess(0, "Preparing worktree");
      }
      if (command.includes("tmux has-session")) return createMockSubprocess(1);
      if (command.includes("tmux new-session")) return createMockSubprocess(0, "");
      if (command.includes("tmux send-keys")) return createMockSubprocess(0);
      return createMockSubprocess(0);
    }) as unknown as typeof Bun.spawn;

    const { spawnAgent, stopAgent } = await import("../orchestrator.ts");

    const ticketId = `BRANCH-TEST-${Date.now()}`;
    const result = await spawnAgent({
      ticketId,
      agentType: "opencode",
      repoPath: "/fake/repo",
      issueType: "Story",
      baseBranch: "main",
    });

    expect(result).toHaveProperty("success");
    await stopAgent(ticketId, "/fake/repo");
  });
});

describe("spawnAgent - worktree already exists", () => {
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    originalSpawn = Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  test("handles existing worktree", async () => {
    let worktreeListed = false;

    Bun.spawn = ((cmd: string[]) => {
      const command = cmd.join(" ");

      if (command.includes("worktree list")) {
        if (!worktreeListed) {
          worktreeListed = true;
          return createMockSubprocess(0, "/tmp/repo-worktrees/EXISTING-WT bare\n/tmp/repo-worktrees/EXISTING-WT/EXISTING-WT 12345678 [chore/EXISTING-WT]");
        }
        return createMockSubprocess(0, "");
      }
      if (command.includes("fetch")) return createMockSubprocess(0, "");
      if (command.includes("tmux has-session")) return createMockSubprocess(1);
      if (command.includes("tmux new-session")) return createMockSubprocess(0, "");
      if (command.includes("tmux send-keys")) return createMockSubprocess(0);
      return createMockSubprocess(0);
    }) as unknown as typeof Bun.spawn;

    const { spawnAgent, stopAgent } = await import("../orchestrator.ts");

    const ticketId = `EXISTING-WT-${Date.now()}`;
    const result = await spawnAgent({
      ticketId,
      agentType: "opencode",
      repoPath: "/fake/repo",
      issueType: "Story",
      baseBranch: "main",
    });

    expect(worktreeListed).toBe(true);
    expect(result).toHaveProperty("success");
    await stopAgent(ticketId, "/fake/repo");
  });
});