/**
 * Tests for tmux session management
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
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
} from "./tmux.ts";

// Mock Bun.spawn for testing
const mockSpawn = mock(() => ({
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
    const { parseTmuxList } = await import("./tmux.ts");

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
    const { parseTmuxList } = await import("./tmux.ts");
    const sessions = parseTmuxList("");
    expect(sessions).toHaveLength(0);
  });

  test("should handle no jiratown sessions", async () => {
    const { parseTmuxList } = await import("./tmux.ts");
    const output = `other-session: 1 windows (created Mon Jan  1 10:00:00 2024)`;
    const sessions = parseTmuxList(output);
    expect(sessions).toHaveLength(0);
  });
});

describe("buildTmuxCommand", () => {
  test("should build new-session command", async () => {
    const { buildTmuxCommand } = await import("./tmux.ts");

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
    const { buildTmuxCommand } = await import("./tmux.ts");

    const cmd = buildTmuxCommand("kill-session", {
      targetSession: "test-session",
    });

    expect(cmd).toContain("kill-session");
    expect(cmd).toContain("-t");
    expect(cmd).toContain("test-session");
  });

  test("should build send-keys command", async () => {
    const { buildTmuxCommand } = await import("./tmux.ts");

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
    const { buildTmuxCommand } = await import("./tmux.ts");

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
    const { buildTmuxCommand } = await import("./tmux.ts");

    const cmd = buildTmuxCommand("list-sessions", {});
    expect(cmd).toContain("list-sessions");
  });

  test("should build has-session command", async () => {
    const { buildTmuxCommand } = await import("./tmux.ts");

    const cmd = buildTmuxCommand("has-session", {
      targetSession: "test-session",
    });

    expect(cmd).toContain("has-session");
    expect(cmd).toContain("-t");
    expect(cmd).toContain("test-session");
  });
});
