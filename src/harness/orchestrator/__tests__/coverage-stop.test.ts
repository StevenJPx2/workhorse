import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createMockSubprocess } from "./test-utils.ts";

describe("stopAgent - successful cleanup", () => {
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    originalSpawn = Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  test("stops agent and cleans up properly", async () => {
    Bun.spawn = ((cmd: string[]) => {
      const command = cmd.join(" ");

      if (command.includes("worktree list")) return createMockSubprocess(0, "");
      if (command.includes("fetch")) return createMockSubprocess(0, "");
      if (command.includes("worktree add")) return createMockSubprocess(0, "Preparing worktree");
      if (command.includes("tmux has-session")) return createMockSubprocess(1);
      if (command.includes("tmux new-session")) return createMockSubprocess(0, "");
      if (command.includes("tmux kill-session")) return createMockSubprocess(0);
      if (command.includes("tmux send-keys")) return createMockSubprocess(0);
      if (command.includes("worktree remove")) return createMockSubprocess(0);
      return createMockSubprocess(0);
    }) as unknown as typeof Bun.spawn;

    const { spawnAgent, stopAgent, getAgent } = await import("../orchestrator.ts");

    const ticketId = `STOP-TEST-${Date.now()}`;

    const spawnResult = await spawnAgent({
      ticketId,
      agentType: "opencode",
      repoPath: "/fake/repo",
      issueType: "Story",
      baseBranch: "main",
    });

    expect(spawnResult.success).toBe(true);

    const agent = getAgent(ticketId);
    expect(agent).toBeDefined();

    const stopResult = await stopAgent(ticketId, "/fake/repo", true);
    expect(stopResult.success).toBe(true);

    const agentAfter = getAgent(ticketId);
    expect(agentAfter).toBeUndefined();
  });
});

describe("stopAgent - error handling", () => {
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    originalSpawn = Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  test("handles errors during stop gracefully", async () => {
    Bun.spawn = ((cmd: string[]) => {
      const command = cmd.join(" ");

      if (command.includes("worktree list")) return createMockSubprocess(0, "");
      if (command.includes("fetch")) return createMockSubprocess(0, "");
      if (command.includes("worktree add")) return createMockSubprocess(0, "Preparing worktree");
      if (command.includes("tmux has-session")) return createMockSubprocess(1);
      if (command.includes("tmux new-session")) return createMockSubprocess(0, "");
      if (command.includes("tmux kill-session")) return createMockSubprocess(1, "", "session not found");
      if (command.includes("tmux send-keys")) return createMockSubprocess(0);
      return createMockSubprocess(0);
    }) as unknown as typeof Bun.spawn;

    const { spawnAgent, stopAgent } = await import("../orchestrator.ts");

    const ticketId = `STOP-ERROR-${Date.now()}`;

    const spawnResult = await spawnAgent({
      ticketId,
      agentType: "opencode",
      repoPath: "/fake/repo",
      issueType: "Story",
      baseBranch: "main",
    });

    expect(spawnResult.success).toBe(true);

    const stopResult = await stopAgent(ticketId, "/fake/repo");
    expect(stopResult).toHaveProperty("success");
  });
});