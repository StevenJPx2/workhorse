import type { Emitter } from "mitt";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JiratownConfig } from "#config";
import type { HookEventMap } from "#lib/hooks";
import type { MemoryService } from "#services/memory";
import type { Database } from "../../../db/database.ts";
import { HarnessOrchestrator } from "../orchestrator.ts";
import type { OrchestratorTool } from "../types/index.ts";

/** Creates minimal mock dependencies */
function createMockDeps() {
  const db = {
    issues: {
      get: vi.fn(),
      update: vi.fn(),
    },
  } as unknown as Database;

  const hooks = {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  } as unknown as Emitter<HookEventMap>;

  const memory = {
    l1: { get: vi.fn().mockReturnValue(null) },
    l2: { search: vi.fn().mockResolvedValue([]) },
    notifications: {
      getUnread: vi.fn().mockReturnValue([]),
      generateInbox: vi.fn().mockReturnValue(""),
    },
  } as unknown as MemoryService;

  const config = {
    prompt: { custom: undefined },
    repo: { baseBranch: "main" },
  } as unknown as JiratownConfig;

  return { db, hooks, memory, config };
}

describe("HarnessOrchestrator", () => {
  let orchestrator: HarnessOrchestrator;
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    deps = createMockDeps();
    orchestrator = new HarnessOrchestrator(deps.db, deps.hooks, deps.memory, deps.config);
  });

  describe("registerTool", () => {
    it("registers a tool", () => {
      const tool: OrchestratorTool = {
        name: "test_tool",
        description: "A test tool",
        schema: { type: "object", properties: {} },
        execute: vi.fn(),
      };

      orchestrator.registerTool(tool);
      expect(orchestrator.getTools()).toContain(tool);
    });

    it("allows registering multiple tools", () => {
      const tool1: OrchestratorTool = {
        name: "tool1",
        description: "Tool 1",
        schema: { type: "object" },
        execute: vi.fn(),
      };
      const tool2: OrchestratorTool = {
        name: "tool2",
        description: "Tool 2",
        schema: { type: "object" },
        execute: vi.fn(),
      };

      orchestrator.registerTool(tool1);
      orchestrator.registerTool(tool2);

      const tools = orchestrator.getTools();
      expect(tools).toHaveLength(2);
      expect(tools).toContain(tool1);
      expect(tools).toContain(tool2);
    });
  });

  describe("getTools", () => {
    it("returns empty array when no tools registered", () => {
      expect(orchestrator.getTools()).toEqual([]);
    });

    it("returns a copy of tools array", () => {
      const tool: OrchestratorTool = {
        name: "test",
        description: "Test",
        schema: { type: "object" },
        execute: vi.fn(),
      };

      orchestrator.registerTool(tool);
      const tools1 = orchestrator.getTools();
      const tools2 = orchestrator.getTools();

      expect(tools1).not.toBe(tools2);
      expect(tools1).toEqual(tools2);
    });
  });

  describe("getAgent", () => {
    it("returns undefined if no agent for issue", () => {
      expect(orchestrator.getAgent("PROJ-999")).toBeUndefined();
    });
  });

  describe("getAll", () => {
    it("returns empty array when no agents", () => {
      expect(orchestrator.getAll()).toEqual([]);
    });
  });

  describe("stop", () => {
    it("does nothing if no agent for issue", async () => {
      // Should not throw
      await orchestrator.stop("PROJ-999");
    });
  });

  describe("shutdown", () => {
    it("completes when no agents running", async () => {
      // Should not throw
      await orchestrator.shutdown();
      expect(orchestrator.getAll()).toHaveLength(0);
    });
  });

  describe("notification subscription", () => {
    it("subscribes to notification.created hook", () => {
      expect(deps.hooks.on).toHaveBeenCalledWith("notification.created", expect.any(Function));
    });
  });
});
