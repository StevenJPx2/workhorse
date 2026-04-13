/**
 * Tests for tmux session management
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  TmuxSession,
  createTmuxSessionName,
  isTmuxAvailable,
  createSession,
  listSessions,
  killSession,
  sendKeys,
  capturePane,
  sessionExists,
} from "../tmux/index.ts";

// Mock Bun.spawn for testing
const _mockSpawn = mock(() => ({
  exitCode: 0,
  stdout: new ReadableStream(),
  stderr: new ReadableStream(),
}));

describe("createTmuxSessionName", () => {
  test("should create valid session name from ticket ID", () => {
    const name = createTmuxSessionName("PROJ-123");
    expect(name).toBe("jt-PROJ-123");
  });

  test("should sanitize invalid characters", () => {
    const name = createTmuxSessionName("PROJ/123:test");
    expect(name).toBe("jt-PROJ-123-test");
  });

  test("should handle lowercase ticket IDs", () => {
    const name = createTmuxSessionName("proj-456");
    expect(name).toBe("jt-proj-456");
  });
});

describe("TmuxSession", () => {
  test("should create session with correct properties", () => {
    const session: TmuxSession = {
      name: "jt-TEST-1",
      ticketId: "TEST-1",
      workdir: "/path/to/worktree",
      createdAt: new Date().toISOString(),
    };

    expect(session.name).toBe("jt-TEST-1");
    expect(session.ticketId).toBe("TEST-1");
    expect(session.workdir).toBe("/path/to/worktree");
    expect(session.createdAt).toBeDefined();
  });
});

describe("parseTmuxList", () => {
  test("should parse tmux list-sessions output", async () => {
    // This is tested via listSessions integration
    // Unit test verifies the parser logic
    const { parseTmuxList } = await import("../tmux/index.ts");

    const output = `jt-PROJ-1: 1 windows (created Mon Jan  1 10:00:00 2024)
jt-PROJ-2: 1 windows (created Mon Jan  1 11:00:00 2024)
other-session: 2 windows (created Mon Jan  1 12:00:00 2024)`;

    const sessions = parseTmuxList(output);

    expect(sessions).toHaveLength(2); // Only jt- prefixed sessions
    expect(sessions[0].name).toBe("jt-PROJ-1");
    expect(sessions[0].ticketId).toBe("PROJ-1");
    expect(sessions[1].name).toBe("jt-PROJ-2");
    expect(sessions[1].ticketId).toBe("PROJ-2");
  });

  test("should handle empty output", async () => {
    const { parseTmuxList } = await import("../tmux/index.ts");
    const sessions = parseTmuxList("");
    expect(sessions).toHaveLength(0);
  });

  test("should handle no jiratown sessions", async () => {
    const { parseTmuxList } = await import("../tmux/index.ts");
    const output = `other-session: 1 windows (created Mon Jan  1 10:00:00 2024)`;
    const sessions = parseTmuxList(output);
    expect(sessions).toHaveLength(0);
  });
});

describe("buildTmuxCommand", () => {
  test("should build new-session command", async () => {
    const { buildTmuxCommand } = await import("../tmux/index.ts");

    const cmd = buildTmuxCommand("new-session", {
      detached: true,
      sessionName: "test-session",
      startDirectory: "/path/to/dir",
    });

    expect(cmd).toContain("new-session");
    expect(cmd).toContain("-d");
    expect(cmd).toContain("-s");
    expect(cmd).toContain("test-session");
    expect(cmd).toContain("-c");
    expect(cmd).toContain("/path/to/dir");
  });

  test("should build kill-session command", async () => {
    const { buildTmuxCommand } = await import("../tmux/index.ts");

    const cmd = buildTmuxCommand("kill-session", {
      targetSession: "test-session",
    });

    expect(cmd).toContain("kill-session");
    expect(cmd).toContain("-t");
    expect(cmd).toContain("test-session");
  });

  test("should build send-keys command", async () => {
    const { buildTmuxCommand } = await import("../tmux/index.ts");

    const cmd = buildTmuxCommand("send-keys", {
      targetSession: "test-session",
      keys: "echo hello",
      enter: true,
    });

    expect(cmd).toContain("send-keys");
    expect(cmd).toContain("-t");
    expect(cmd).toContain("test-session");
    expect(cmd).toContain("echo hello");
    expect(cmd).toContain("Enter");
  });

  test("should build capture-pane command", async () => {
    const { buildTmuxCommand } = await import("../tmux/index.ts");

    const cmd = buildTmuxCommand("capture-pane", {
      targetSession: "test-session",
      print: true,
    });

    expect(cmd).toContain("capture-pane");
    expect(cmd).toContain("-t");
    expect(cmd).toContain("test-session");
    expect(cmd).toContain("-p");
  });

  test("should build list-sessions command", async () => {
    const { buildTmuxCommand } = await import("../tmux/index.ts");

    const cmd = buildTmuxCommand("list-sessions", {});
    expect(cmd).toContain("list-sessions");
  });

  test("should build has-session command", async () => {
    const { buildTmuxCommand } = await import("../tmux/index.ts");

    const cmd = buildTmuxCommand("has-session", {
      targetSession: "test-session",
    });

    expect(cmd).toContain("has-session");
    expect(cmd).toContain("-t");
    expect(cmd).toContain("test-session");
  });
});

describe("Async tmux operations", () => {
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    originalSpawn = Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  // Helper to create mock subprocess
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

  describe("isTmuxAvailable", () => {
    test("returns true when tmux is available", async () => {
      Bun.spawn = (() => createMockSubprocess(0, "tmux 3.2a")) as unknown as typeof Bun.spawn;

      const result = await isTmuxAvailable();
      expect(result).toBe(true);
    });

    test("returns false when tmux is not available", async () => {
      Bun.spawn = (() =>
        createMockSubprocess(127, "", "command not found")) as unknown as typeof Bun.spawn;

      const result = await isTmuxAvailable();
      expect(result).toBe(false);
    });

    test("handles spawn errors", async () => {
      Bun.spawn = (() => {
        throw new Error("Spawn failed");
      }) as unknown as typeof Bun.spawn;

      const result = await isTmuxAvailable();
      expect(result).toBe(false);
    });
  });

  describe("createSession", () => {
    test("creates session successfully", async () => {
      Bun.spawn = (() => createMockSubprocess(0, "")) as unknown as typeof Bun.spawn;

      const result = await createSession("TEST-123", "/path/to/worktree");
      expect(result).not.toBeNull();
      expect(result?.name).toBe("jt-TEST-123");
      expect(result?.ticketId).toBe("TEST-123");
      expect(result?.workdir).toBe("/path/to/worktree");
      expect(result?.createdAt).toBeDefined();
    });

    test("returns null when tmux command fails", async () => {
      Bun.spawn = (() =>
        createMockSubprocess(1, "", "session already exists")) as unknown as typeof Bun.spawn;

      const result = await createSession("TEST-123", "/path/to/worktree");
      expect(result).toBeNull();
    });

    test("handles spawn errors", async () => {
      Bun.spawn = (() => {
        throw new Error("Spawn failed");
      }) as unknown as typeof Bun.spawn;

      const result = await createSession("TEST-123", "/path/to/worktree");
      expect(result).toBeNull();
    });
  });

  describe("listSessions", () => {
    test("returns list of sessions", async () => {
      const output = `jt-TEST-1: 1 windows (created Mon Jan  1 10:00:00 2024)
jt-TEST-2: 1 windows (created Mon Jan  1 11:00:00 2024)`;
      Bun.spawn = (() => createMockSubprocess(0, output)) as unknown as typeof Bun.spawn;

      const result = await listSessions();
      expect(result).toHaveLength(2);
      expect(result[0].ticketId).toBe("TEST-1");
      expect(result[1].ticketId).toBe("TEST-2");
    });

    test("returns empty array when no server running", async () => {
      Bun.spawn = (() =>
        createMockSubprocess(
          1,
          "",
          "no server running on /tmp/tmux-1000/default",
        )) as unknown as typeof Bun.spawn;

      const result = await listSessions();
      expect(result).toEqual([]);
    });

    test("returns empty array on other errors", async () => {
      Bun.spawn = (() =>
        createMockSubprocess(1, "", "some other error")) as unknown as typeof Bun.spawn;

      const result = await listSessions();
      expect(result).toEqual([]);
    });

    test("handles spawn errors", async () => {
      Bun.spawn = (() => {
        throw new Error("Spawn failed");
      }) as unknown as typeof Bun.spawn;

      const result = await listSessions();
      expect(result).toEqual([]);
    });
  });

  describe("sessionExists", () => {
    test("returns true when session exists", async () => {
      Bun.spawn = (() => createMockSubprocess(0)) as unknown as typeof Bun.spawn;

      const result = await sessionExists("TEST-123");
      expect(result).toBe(true);
    });

    test("returns false when session does not exist", async () => {
      Bun.spawn = (() => createMockSubprocess(1)) as unknown as typeof Bun.spawn;

      const result = await sessionExists("NONEXISTENT");
      expect(result).toBe(false);
    });

    test("handles spawn errors", async () => {
      Bun.spawn = (() => {
        throw new Error("Spawn failed");
      }) as unknown as typeof Bun.spawn;

      const result = await sessionExists("TEST-123");
      expect(result).toBe(false);
    });
  });

  describe("killSession", () => {
    test("returns true when session killed successfully", async () => {
      Bun.spawn = (() => createMockSubprocess(0)) as unknown as typeof Bun.spawn;

      const result = await killSession("TEST-123");
      expect(result).toBe(true);
    });

    test("returns false when kill fails", async () => {
      Bun.spawn = (() =>
        createMockSubprocess(1, "", "session not found")) as unknown as typeof Bun.spawn;

      const result = await killSession("NONEXISTENT");
      expect(result).toBe(false);
    });

    test("handles spawn errors", async () => {
      Bun.spawn = (() => {
        throw new Error("Spawn failed");
      }) as unknown as typeof Bun.spawn;

      const result = await killSession("TEST-123");
      expect(result).toBe(false);
    });
  });

  describe("sendKeys", () => {
    test("returns true when keys sent successfully", async () => {
      Bun.spawn = (() => createMockSubprocess(0)) as unknown as typeof Bun.spawn;

      const result = await sendKeys("TEST-123", "echo hello", true);
      expect(result).toBe(true);
    });

    test("returns true without pressing enter", async () => {
      Bun.spawn = (() => createMockSubprocess(0)) as unknown as typeof Bun.spawn;

      const result = await sendKeys("TEST-123", "echo hello", false);
      expect(result).toBe(true);
    });

    test("returns false when send fails", async () => {
      Bun.spawn = (() =>
        createMockSubprocess(1, "", "session not found")) as unknown as typeof Bun.spawn;

      const result = await sendKeys("NONEXISTENT", "echo hello");
      expect(result).toBe(false);
    });

    test("handles spawn errors", async () => {
      Bun.spawn = (() => {
        throw new Error("Spawn failed");
      }) as unknown as typeof Bun.spawn;

      const result = await sendKeys("TEST-123", "echo hello");
      expect(result).toBe(false);
    });
  });

  describe("capturePane", () => {
    test("returns output when capture succeeds", async () => {
      const output = "line 1\nline 2\nline 3";
      Bun.spawn = (() => createMockSubprocess(0, output)) as unknown as typeof Bun.spawn;

      const result = await capturePane("TEST-123");
      expect(result).toBe(output);
    });

    test("returns null when capture fails", async () => {
      Bun.spawn = (() =>
        createMockSubprocess(1, "", "session not found")) as unknown as typeof Bun.spawn;

      const result = await capturePane("NONEXISTENT");
      expect(result).toBeNull();
    });

    test("handles spawn errors", async () => {
      Bun.spawn = (() => {
        throw new Error("Spawn failed");
      }) as unknown as typeof Bun.spawn;

      const result = await capturePane("TEST-123");
      expect(result).toBeNull();
    });
  });
});
