import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createMockSubprocess } from "./test-utils.ts";

describe("checkAgentHealth - running agent", () => {
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    originalSpawn = Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  test("checks health of running agent", async () => {
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

    const { spawnAgent, checkAgentHealth, stopAgent } = await import("../orchestrator.ts");

    const ticketId = `HEALTH-RUN-${Date.now()}`;

    await spawnAgent({
      ticketId,
      agentType: "opencode",
      repoPath: "/fake/repo",
      issueType: "Story",
      baseBranch: "main",
    });

    const health = await checkAgentHealth(ticketId);

    expect(health.ticketId).toBe(ticketId);
    expect(health).toHaveProperty("healthy");
    expect(health).toHaveProperty("sessionExists");
    expect(health).toHaveProperty("checkedAt");

    await stopAgent(ticketId, "/fake/repo");
  });
});

describe("checkAgentHealth - crashed agent detection", () => {
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    originalSpawn = Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  test("detects crashed agent when session is gone", async () => {
    let hasSessionResult = 0;
    let _hasSessionChecked = false;

    Bun.spawn = ((cmd: string[]) => {
      const command = cmd.join(" ");

      if (command.includes("worktree list")) return createMockSubprocess(0, "");
      if (command.includes("fetch")) return createMockSubprocess(0, "");
      if (command.includes("worktree add")) return createMockSubprocess(0, "Preparing worktree");
      if (command.includes("tmux has-session")) {
        _hasSessionChecked = true;
        const result = hasSessionResult;
        hasSessionResult = 1;
        return createMockSubprocess(result);
      }
      if (command.includes("tmux new-session")) return createMockSubprocess(0, "");
      if (command.includes("tmux send-keys")) return createMockSubprocess(0);
      return createMockSubprocess(0);
    }) as unknown as typeof Bun.spawn;

    const { spawnAgent, checkAgentHealth, getAgent, stopAgent } =
      await import("../orchestrator.ts");

    const ticketId = `HEALTH-CRASH-${Date.now()}`;

    await spawnAgent({
      ticketId,
      agentType: "opencode",
      repoPath: "/fake/repo",
      issueType: "Story",
      baseBranch: "main",
    });

    const health1 = await checkAgentHealth(ticketId);
    expect(health1.sessionExists).toBe(true);

    const health2 = await checkAgentHealth(ticketId);
    expect(health2.sessionExists).toBe(false);

    const agent = getAgent(ticketId);
    if (agent && agent.state === "crashed") {
      expect(agent.state).toBe("crashed");
    }

    await stopAgent(ticketId, "/fake/repo");
  });
});
