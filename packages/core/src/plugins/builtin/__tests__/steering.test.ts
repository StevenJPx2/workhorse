import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkhorseContext } from "#context";

import { registerCoreSteering } from "../steering.ts";

describe("registerCoreSteering", () => {
  let mockContext: WorkhorseContext;
  let registeredRules: Array<{
    id: string;
    condition: { when: Function };
    reminder: string;
  }>;

  beforeEach(() => {
    registeredRules = [];
    mockContext = {
      orchestrator: {
        registerSteeringRule: vi.fn((rule) => registeredRules.push(rule)),
      },
    } as unknown as WorkhorseContext;
  });

  it("registers both steering rules", () => {
    registerCoreSteering(mockContext);

    expect(mockContext.orchestrator.registerSteeringRule).toHaveBeenCalledTimes(
      2,
    );
    expect(registeredRules.map((r) => r.id)).toEqual([
      "core:memory-write-reminder",
      "core:git-conflict-loop",
    ]);
  });

  describe("memory-write-reminder condition", () => {
    const createToolHistory = (tools: string[]) =>
      tools.map((name) => ({ name, args: {}, timestamp: Date.now() }));

    const getWhenFn = () => {
      registerCoreSteering(mockContext);
      const rule = registeredRules[0];
      if (!rule?.condition?.when) throw new Error("Rule not registered");
      return rule.condition.when;
    };

    it("returns false when tool history is too short", () => {
      const when = getWhenFn();

      const result = when({
        issue: { id: "TEST-1", status: "implementing" },
        notifications: [],
        toolHistory: createToolHistory(["read", "grep", "edit"]),
      });

      expect(result).toBe(false);
    });

    it("returns false when no work tools used", () => {
      const when = getWhenFn();

      // 20 tool calls but all reads/searches
      const result = when({
        issue: { id: "TEST-1", status: "implementing" },
        notifications: [],
        toolHistory: createToolHistory(Array(20).fill("read")),
      });

      expect(result).toBe(false);
    });

    it("returns true when significant work done without memory write", () => {
      const when = getWhenFn();

      // 15+ tools with 3+ work tools, no memory write
      const tools = [
        ...Array(10).fill("read"),
        "edit",
        "write",
        "bash",
        "read",
        "grep",
        "read",
      ];
      const result = when({
        issue: { id: "TEST-1", status: "implementing" },
        notifications: [],
        toolHistory: createToolHistory(tools),
      });

      expect(result).toBe(true);
    });

    it("returns false when memory write was recent", () => {
      const when = getWhenFn();

      // Memory write in the middle, not enough work since
      const tools = [
        ...Array(10).fill("read"),
        "edit",
        "workhorse_memory_write",
        "read",
        "edit",
      ];
      const result = when({
        issue: { id: "TEST-1", status: "implementing" },
        notifications: [],
        toolHistory: createToolHistory(tools),
      });

      expect(result).toBe(false);
    });

    it("returns true when enough work done after memory write", () => {
      const when = getWhenFn();

      // Memory write early, lots of work after
      const tools = [
        "workhorse_memory_write",
        ...Array(12).fill("read"),
        "edit",
        "write",
        "bash",
      ];
      const result = when({
        issue: { id: "TEST-1", status: "implementing" },
        notifications: [],
        toolHistory: createToolHistory(tools),
      });

      expect(result).toBe(true);
    });
  });

  describe("git-conflict-loop condition", () => {
    // Use fresh timestamps relative to when the test runs
    const createBashHistory = (commands: string[], minutesAgo = 1) => {
      const timestamp = Date.now() - minutesAgo * 60_000;
      return commands.map((cmd) => ({
        name: "bash",
        args: { command: cmd },
        timestamp,
      }));
    };

    const getWhenFn = () => {
      registerCoreSteering(mockContext);
      const rule = registeredRules[1]; // Second rule is git-conflict-loop
      if (!rule?.condition?.when) throw new Error("Rule not registered");
      return rule.condition.when;
    };

    it("returns false for non-git bash commands", () => {
      const when = getWhenFn();

      const result = when({
        issue: { id: "TEST-1", status: "implementing" },
        notifications: [],
        toolHistory: createBashHistory(Array(10).fill("npm install")),
      });

      expect(result).toBe(false);
    });

    it("returns false for few git conflict commands", () => {
      const when = getWhenFn();

      const result = when({
        issue: { id: "TEST-1", status: "implementing" },
        notifications: [],
        toolHistory: createBashHistory([
          "git rebase origin/main",
          "git checkout --theirs file.txt",
          "git add file.txt",
        ]),
      });

      expect(result).toBe(false); // Only 3 conflict commands, need 8+
    });

    it("returns true for many git conflict commands within window", () => {
      const when = getWhenFn();

      const result = when({
        issue: { id: "TEST-1", status: "implementing" },
        notifications: [],
        toolHistory: createBashHistory([
          "git rebase origin/main",
          "git checkout --theirs file1.txt",
          "git add file1.txt",
          "git rebase --continue",
          "git checkout --ours file2.txt",
          "git add file2.txt",
          "git rebase --continue",
          "git checkout --theirs file3.txt",
        ]),
      });

      expect(result).toBe(true);
    });

    it("returns false for old git conflict commands outside window", () => {
      const when = getWhenFn();

      const result = when({
        issue: { id: "TEST-1", status: "implementing" },
        notifications: [],
        toolHistory: createBashHistory(
          [
            "git rebase origin/main",
            "git checkout --theirs file1.txt",
            "git add file1.txt",
            "git rebase --continue",
            "git checkout --ours file2.txt",
            "git add file2.txt",
            "git rebase --continue",
            "git checkout --theirs file3.txt",
          ],
          6, // 6 minutes ago (outside 5 min window)
        ),
      });

      expect(result).toBe(false);
    });

    it("counts merge commands as conflict-related", () => {
      const when = getWhenFn();

      const result = when({
        issue: { id: "TEST-1", status: "implementing" },
        notifications: [],
        toolHistory: createBashHistory([
          "git merge feature-branch",
          "git checkout --theirs file1.txt",
          "git add .",
          "git merge --continue",
          "git checkout --ours file2.txt",
          "git add .",
          "git merge --continue",
          "git checkout --theirs file3.txt",
        ]),
      });

      expect(result).toBe(true);
    });

    it("counts cherry-pick commands as conflict-related", () => {
      const when = getWhenFn();

      const result = when({
        issue: { id: "TEST-1", status: "implementing" },
        notifications: [],
        toolHistory: createBashHistory([
          "git cherry-pick abc123",
          "git checkout --theirs file1.txt",
          "git add .",
          "git cherry-pick --continue",
          "git checkout --ours file2.txt",
          "git add .",
          "git cherry-pick --continue",
          "git checkout --theirs file3.txt",
        ]),
      });

      expect(result).toBe(true);
    });

    it("ignores non-bash tool calls", () => {
      const when = getWhenFn();
      const recentTimestamp = Date.now() - 60_000; // 1 minute ago

      const toolHistory = [
        // These should be ignored (not bash)
        {
          name: "read",
          args: { path: "file.txt" },
          timestamp: recentTimestamp,
        },
        {
          name: "edit",
          args: { path: "file.txt" },
          timestamp: recentTimestamp,
        },
        // Only 3 bash conflict commands (not enough)
        ...createBashHistory([
          "git rebase origin/main",
          "git add .",
          "git rebase --continue",
        ]),
      ];

      const result = when({
        issue: { id: "TEST-1", status: "implementing" },
        notifications: [],
        toolHistory,
      });

      expect(result).toBe(false);
    });
  });
});
