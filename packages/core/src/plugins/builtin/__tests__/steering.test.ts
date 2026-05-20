import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkhorseContext } from "#context";

import { registerCoreSteering } from "../steering.ts";

describe("registerCoreSteering", () => {
  let mockContext: WorkhorseContext;
  let registeredRules: Array<{ id: string; condition: { when: Function } }>;

  beforeEach(() => {
    registeredRules = [];
    mockContext = {
      orchestrator: {
        registerSteeringRule: vi.fn((rule) => registeredRules.push(rule)),
      },
    } as unknown as WorkhorseContext;
  });

  it("registers memory-write-reminder rule", () => {
    registerCoreSteering(mockContext);

    expect(mockContext.orchestrator.registerSteeringRule).toHaveBeenCalledTimes(1);
    expect(registeredRules[0]?.id).toBe("core:memory-write-reminder");
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
      const tools = [...Array(10).fill("read"), "edit", "write", "bash", "read", "grep", "read"];
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
      const tools = [...Array(10).fill("read"), "edit", "workhorse_memory_write", "read", "edit"];
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
      const tools = ["workhorse_memory_write", ...Array(12).fill("read"), "edit", "write", "bash"];
      const result = when({
        issue: { id: "TEST-1", status: "implementing" },
        notifications: [],
        toolHistory: createToolHistory(tools),
      });

      expect(result).toBe(true);
    });
  });
});
