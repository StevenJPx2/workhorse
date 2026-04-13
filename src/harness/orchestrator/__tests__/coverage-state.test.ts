import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createMockSubprocess } from "./test-utils.ts";

describe("Agent state tracking", () => {
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    originalSpawn = Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  test("tracks agent state transitions", async () => {
    Bun.spawn = ((cmd: string[]) => {
      const command = cmd.join(" ");

      if (command.includes("worktree list")) return createMockSubprocess(0, "");
      if (command.includes("fetch")) return createMockSubprocess(0, "");
      if (command.includes("worktree add")) return createMockSubprocess(0, "Preparing worktree");
      if (command.includes("tmux has-session")) return createMockSubprocess(1);
      if (command.includes("tmux new-session")) return createMockSubprocess(0, "");
      if (command.includes("tmux send-keys")) return createMockSubprocess(0);
      return createMockSubprocess(0);
    }) as unknown as typeof Bun.spawn;

    const { spawnAgent, getAgent, stopAgent } = await import("../orchestrator.ts");

    const ticketId = `STATE-TRACK-${Date.now()}`;

    let agent = getAgent(ticketId);
    expect(agent).toBeUndefined();

    await spawnAgent({
      ticketId,
      agentType: "opencode",
      repoPath: "/fake/repo",
      issueType: "Story",
      baseBranch: "main",
    });

    agent = getAgent(ticketId);
    expect(agent).toBeDefined();
    expect(agent?.state).toBe("running");
    expect(agent?.startedAt).toBeDefined();
    expect(agent?.ticketId).toBe(ticketId);
    expect(agent?.agentType).toBe("opencode");

    await stopAgent(ticketId, "/fake/repo");

    agent = getAgent(ticketId);
    expect(agent).toBeUndefined();
  });
});

describe("spawnAgent with claude agent type", () => {
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    originalSpawn = Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  test("spawns claude agent", async () => {
    let sendKeysCalled = false;
    let keysContent = "";

    Bun.spawn = ((cmd: string[]) => {
      const command = cmd.join(" ");

      if (command.includes("worktree list")) return createMockSubprocess(0, "");
      if (command.includes("fetch")) return createMockSubprocess(0, "");
      if (command.includes("worktree add")) return createMockSubprocess(0, "Preparing worktree");
      if (command.includes("tmux has-session")) return createMockSubprocess(1);
      if (command.includes("tmux new-session")) return createMockSubprocess(0, "");
      if (command.includes("tmux send-keys")) {
        sendKeysCalled = true;
        keysContent = command;
        return createMockSubprocess(0);
      }
      return createMockSubprocess(0);
    }) as unknown as typeof Bun.spawn;

    const { spawnAgent, stopAgent } = await import("../orchestrator.ts");

    const ticketId = `CLAUDE-TEST-${Date.now()}`;

    const result = await spawnAgent({
      ticketId,
      agentType: "claude",
      repoPath: "/fake/repo",
      issueType: "Story",
      baseBranch: "main",
    });

    expect(result.success).toBe(true);
    expect(sendKeysCalled).toBe(true);
    expect(keysContent).toContain("claude");

    await stopAgent(ticketId, "/fake/repo");
  });
});

describe("Exception handling", () => {
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    originalSpawn = Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  test("handles spawn exceptions gracefully", async () => {
    Bun.spawn = (() => {
      throw new Error("Spawn error");
    }) as unknown as typeof Bun.spawn;

    const { spawnAgent } = await import("../orchestrator.ts");

    const ticketId = `EXCEPTION-${Date.now()}`;

    const result = await spawnAgent({
      ticketId,
      agentType: "opencode",
      repoPath: "/fake/repo",
      issueType: "Story",
      baseBranch: "main",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Spawn error");
  });

  test("handles unexpected errors gracefully", async () => {
    Bun.spawn = (() => {
      throw "String error";
    }) as unknown as typeof Bun.spawn;

    const { spawnAgent } = await import("../orchestrator.ts");

    const ticketId = `STRING-ERR-${Date.now()}`;

    const result = await spawnAgent({
      ticketId,
      agentType: "opencode",
      repoPath: "/fake/repo",
      issueType: "Story",
      baseBranch: "main",
    });

    expect(result.success).toBe(false);
  });
});

describe("getAgentsByState with running agents", () => {
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    originalSpawn = Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  test("filters running agents correctly", async () => {
    Bun.spawn = ((cmd: string[]) => {
      const command = cmd.join(" ");

      if (command.includes("worktree list")) return createMockSubprocess(0, "");
      if (command.includes("fetch")) return createMockSubprocess(0, "");
      if (command.includes("worktree add")) return createMockSubprocess(0, "Preparing worktree");
      if (command.includes("tmux has-session")) return createMockSubprocess(1);
      if (command.includes("tmux new-session")) return createMockSubprocess(0, "");
      if (command.includes("tmux send-keys")) return createMockSubprocess(0);
      return createMockSubprocess(0);
    }) as unknown as typeof Bun.spawn;

    const { spawnAgent, getAgentsByState, stopAgent } = await import("../orchestrator.ts");

    const ticketId = `BY-STATE-${Date.now()}`;

    const before = getAgentsByState("running");

    await spawnAgent({
      ticketId,
      agentType: "opencode",
      repoPath: "/fake/repo",
      issueType: "Story",
      baseBranch: "main",
    });

    const after = getAgentsByState("running");
    expect(after.length).toBeGreaterThanOrEqual(before.length);

    after.forEach((agent) => {
      expect(agent.state).toBe("running");
    });

    await stopAgent(ticketId, "/fake/repo");
  });
});
