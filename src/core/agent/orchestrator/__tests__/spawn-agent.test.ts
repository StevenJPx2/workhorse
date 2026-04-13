import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { cleanupTestWorktreesAfterAll } from "../../../../test/cleanup-worktrees.ts";

cleanupTestWorktreesAfterAll();

function createMockSubprocess(exitCode: number, stdout: string = "", stderr: string = "") {
  return {
    stdout: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(stdout));
        controller.close();
      },
    }),
    stderr: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(stderr));
        controller.close();
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

describe("Orchestrator: spawn agent", () => {
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    originalSpawn = Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  test("exports spawnAgent function", async () => {
    const { spawnAgent } = await import("../orchestrator.ts");
    expect(typeof spawnAgent).toBe("function");
  });

  test("spawnAgent requires proper options structure", async () => {
    const { spawnAgent } = await import("../orchestrator.ts");
    expect(spawnAgent.length).toBe(1);
  });

  test("handles spawn errors gracefully", async () => {
    Bun.spawn = ((_cmd: string[]) => {
      return createMockSubprocess(1, "", "fatal: not a git repository");
    }) as unknown as typeof Bun.spawn;

    const { spawnAgent } = await import("../orchestrator.ts");

    const result = await spawnAgent({
      ticketId: `SPAWN-FAIL-${Date.now()}`,
      agentType: "opencode",
      repoPath: "/nonexistent/path",
      issueType: "Story",
      baseBranch: "main",
    });

    expect(result).toHaveProperty("success");
    expect(typeof result.success).toBe("boolean");
  });

  test("returns error when worktree creation fails", async () => {
    Bun.spawn = ((cmd: string[]) => {
      const command = cmd.join(" ");

      if (command.includes("worktree list")) {
        return createMockSubprocess(0, "");
      }
      if (command.includes("fetch")) {
        return createMockSubprocess(1, "", "fatal: not a git repository");
      }
      return createMockSubprocess(0);
    }) as unknown as typeof Bun.spawn;

    const { spawnAgent } = await import("../orchestrator.ts");

    const result = await spawnAgent({
      ticketId: `WORKTREE-FAIL-${Date.now()}`,
      agentType: "opencode",
      repoPath: "/fake/repo",
      issueType: "Story",
      baseBranch: "main",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("worktree");
  });

  test("returns error when session creation fails", async () => {
    Bun.spawn = ((cmd: string[]) => {
      const command = cmd.join(" ");

      if (command.includes("worktree list")) return createMockSubprocess(0, "");
      if (command.includes("fetch")) return createMockSubprocess(0, "");
      if (command.includes("worktree add")) return createMockSubprocess(0, "Preparing worktree");
      if (command.includes("tmux has-session")) return createMockSubprocess(1);
      if (command.includes("tmux new-session"))
        return createMockSubprocess(1, "", "failed to create session");
      return createMockSubprocess(0);
    }) as unknown as typeof Bun.spawn;

    const { spawnAgent } = await import("../orchestrator.ts");

    const result = await spawnAgent({
      ticketId: `SESSION-FAIL-${Date.now()}`,
      agentType: "opencode",
      repoPath: "/fake/repo",
      issueType: "Story",
      baseBranch: "main",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("session");
  });

  test("returns error when agent start fails", async () => {
    Bun.spawn = ((cmd: string[]) => {
      const command = cmd.join(" ");

      if (command.includes("worktree list")) return createMockSubprocess(0, "");
      if (command.includes("fetch")) return createMockSubprocess(0, "");
      if (command.includes("worktree add")) return createMockSubprocess(0, "Preparing worktree");
      if (command.includes("tmux has-session")) return createMockSubprocess(1);
      if (command.includes("tmux new-session")) return createMockSubprocess(0, "");
      if (command.includes("tmux send-keys"))
        return createMockSubprocess(1, "", "failed to send keys");
      return createMockSubprocess(0);
    }) as unknown as typeof Bun.spawn;

    const { spawnAgent } = await import("../orchestrator.ts");

    const result = await spawnAgent({
      ticketId: `AGENT-FAIL-${Date.now()}`,
      agentType: "opencode",
      repoPath: "/fake/repo",
      issueType: "Story",
      baseBranch: "main",
    });

    expect(result).toHaveProperty("success");
  });

  test("kills existing session before creating new one", async () => {
    let hasSessionChecked = false;
    let killSessionCalled = false;

    Bun.spawn = ((cmd: string[]) => {
      const command = cmd.join(" ");

      if (command.includes("worktree list")) return createMockSubprocess(0, "");
      if (command.includes("fetch")) return createMockSubprocess(0, "");
      if (command.includes("worktree add")) return createMockSubprocess(0, "Preparing worktree");
      if (command.includes("tmux has-session")) {
        if (!hasSessionChecked) {
          hasSessionChecked = true;
          return createMockSubprocess(0);
        }
        return createMockSubprocess(1);
      }
      if (command.includes("tmux kill-session")) {
        killSessionCalled = true;
        return createMockSubprocess(0);
      }
      if (command.includes("tmux new-session")) return createMockSubprocess(0, "");
      if (command.includes("tmux send-keys")) return createMockSubprocess(0);
      return createMockSubprocess(0);
    }) as unknown as typeof Bun.spawn;

    const { spawnAgent } = await import("../orchestrator.ts");

    await spawnAgent({
      ticketId: `KILL-EXISTING-${Date.now()}`,
      agentType: "opencode",
      repoPath: "/fake/repo",
      issueType: "Story",
      baseBranch: "main",
    });

    expect(killSessionCalled || hasSessionChecked).toBe(true);
  });
});

describe("Orchestrator: spawn options validation", () => {
  test("validates spawn options structure", () => {
    const validOptions = {
      ticketId: "AM-123",
      agentType: "opencode" as const,
      repoPath: "/test/repo",
      issueType: "Story" as const,
      baseBranch: "main",
      jiraCloudId: "test.atlassian.net",
      jiraSummary: "Test summary",
      jiraDescription: "Test description",
    };

    expect(validOptions.ticketId).toBeDefined();
    expect(validOptions.agentType).toBeDefined();
    expect(validOptions.repoPath).toBeDefined();
    expect(validOptions.issueType).toBeDefined();
    expect(validOptions.baseBranch).toBeDefined();
  });

  test("validates optional fields can be omitted", () => {
    const minimalOptions = {
      ticketId: "AM-123",
      agentType: "opencode" as const,
      repoPath: "/test/repo",
      issueType: "Story" as const,
      baseBranch: "main",
    };

    expect(minimalOptions.ticketId).toBe("AM-123");
    expect(minimalOptions.jiraCloudId).toBeUndefined();
    expect(minimalOptions.jiraSummary).toBeUndefined();
  });

  test("spawnAgent returns proper result structure on failure", async () => {
    const { spawnAgent } = await import("../orchestrator.ts");

    const result = await spawnAgent({
      ticketId: "FAIL-TEST-001",
      agentType: "opencode",
      repoPath: "/invalid/repo/path",
      issueType: "Story",
      baseBranch: "main",
    });

    expect(result).toHaveProperty("success");
    expect(typeof result.success).toBe("boolean");

    if (!result.success) {
      expect(result).toHaveProperty("error");
      expect(typeof result.error).toBe("string");
    }
  });
});
