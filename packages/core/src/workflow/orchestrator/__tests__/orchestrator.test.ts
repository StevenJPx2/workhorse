import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JiratownConfig } from "#config";
import type { Issue } from "#db";
import type { Database } from "#db/database";
import type { HookEmitter } from "#lib/hooks";
import type { MemoryService } from "#services/memory";
import { AgentAdapter, type OrchestratorTool } from "#workflow/orchestrator";
import { HarnessOrchestrator } from "#workflow/orchestrator";

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
  } as unknown as HookEmitter;

  const memory = {
    l1: { get: vi.fn().mockReturnValue(null) },
    l2: { search: vi.fn().mockResolvedValue([]) },
    notifications: {
      getUnread: vi.fn().mockReturnValue([]),
      generateInbox: vi.fn().mockReturnValue(""),
    },
  } as unknown as MemoryService;

  const config = {
    agent: { harness: "test" },
    prompt: { custom: undefined },
    repo: { baseBranch: "main" },
    steering: { debounceMs: 1000, cooldownMs: 5000, maxReminders: 3 },
  } as unknown as JiratownConfig;

  return { db, hooks, memory, config };
}

/** Creates a mock issue */
function createMockIssue(externalId = "TEST-123"): Issue {
  return {
    id: crypto.randomUUID(),
    externalId,
    source: "test",
    issueType: "task",
    title: "Test Issue",
    description: "Test description",
    status: "pending",
    url: null,
    assignee: null,
    labels: null,
    metadata: {},
    worktreePath: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Creates a mock adapter class that returns mock adapters */
function createMockAdapterClass() {
  const MockAdapterClass = class {
    static async create(options: { issue: Issue; repoPath: string }) {
      const issue = options.issue;
      return {
        harness: "test" as const,
        state: "stopped" as "stopped" | "starting" | "running" | "stopping" | "crashed",
        issue,
        worktreePath: "/test/worktree",
        repoPath: "/test/repo",
        systemPrompt: "",
        initialMessage: "",
        model: undefined,
        issueId: issue.externalId,
        async start() {
          this.state = "running";
        },
        async sendMessage(_content: string) {
          if (this.state !== "running") {
            throw new Error(`Agent not running (state: ${this.state})`);
          }
        },
        async stop() {
          this.state = "stopped";
        },
        isRunning() {
          return this.state === "running";
        },
      };
    }
  };
  return MockAdapterClass as unknown as typeof AgentAdapter;
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

  describe("untrack", () => {
    it("does nothing if no agent for issue", () => {
      // Should not throw
      orchestrator.untrack("PROJ-999");
      expect(orchestrator.getAgent("PROJ-999")).toBeUndefined();
    });
  });

  describe("shutdown", () => {
    it("completes when no agents running", async () => {
      // Should not throw
      await orchestrator.shutdown();
      expect(orchestrator.getAll()).toHaveLength(0);
    });
  });

  describe("hooks", () => {
    it("does not subscribe to hooks (adapters handle their own subscriptions)", () => {
      // Orchestrator no longer subscribes to notification.created or steering.reminder
      // Each AgentAdapter subscribes to these during initialize()
      expect(deps.hooks.on).not.toHaveBeenCalled();
    });
  });

  describe("registerAdapter", () => {
    it("registers an adapter class", () => {
      const MockAdapter = createMockAdapterClass();
      orchestrator.registerAdapter("test", MockAdapter);
      expect(orchestrator.getAdapterClass("test")).toBe(MockAdapter);
    });

    it("warns when overwriting an existing adapter", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const MockAdapter1 = createMockAdapterClass();
      const MockAdapter2 = createMockAdapterClass();

      orchestrator.registerAdapter("test", MockAdapter1);
      orchestrator.registerAdapter("test", MockAdapter2);

      expect(warnSpy).toHaveBeenCalledWith(
        'Adapter for harness "test" already registered, overwriting',
      );
      expect(orchestrator.getAdapterClass("test")).toBe(MockAdapter2);
      warnSpy.mockRestore();
    });
  });

  describe("getAdapterClass", () => {
    it("returns undefined for unregistered harness", () => {
      expect(orchestrator.getAdapterClass("unknown")).toBeUndefined();
    });
  });

  describe("spawn", () => {
    it("spawns an agent and tracks it", async () => {
      const MockAdapter = createMockAdapterClass();
      orchestrator.registerAdapter("test", MockAdapter);

      const issue = createMockIssue();
      const agent = await orchestrator.spawn({ issue, repoPath: "/test/repo" });

      expect(agent.harness).toBe("test");
      expect(orchestrator.getAgent("TEST-123")).toBe(agent);
      expect(orchestrator.getAll()).toContain(agent);
    });

    it("uses default harness from config", async () => {
      const MockAdapter = createMockAdapterClass();
      orchestrator.registerAdapter("test", MockAdapter);

      const issue = createMockIssue();
      const agent = await orchestrator.spawn({ issue, repoPath: "/test/repo" });

      expect(agent.harness).toBe("test");
    });

    it("throws if no adapter registered for harness", async () => {
      const issue = createMockIssue();
      await expect(
        orchestrator.spawn({ issue, repoPath: "/test/repo", harness: "unknown" }),
      ).rejects.toThrow("No adapter registered for harness: unknown");
    });

    it("throws if agent already running for issue", async () => {
      const MockAdapter = createMockAdapterClass();
      orchestrator.registerAdapter("test", MockAdapter);

      const issue = createMockIssue();
      const agent = await orchestrator.spawn({ issue, repoPath: "/test/repo" });
      agent.state = "running";

      await expect(orchestrator.spawn({ issue, repoPath: "/test/repo" })).rejects.toThrow(
        "Agent for issue TEST-123 is already running",
      );
    });

    it("replaces stopped agent for same issue", async () => {
      const MockAdapter = createMockAdapterClass();
      orchestrator.registerAdapter("test", MockAdapter);

      const issue = createMockIssue();
      const agent1 = await orchestrator.spawn({ issue, repoPath: "/test/repo" });
      agent1.state = "stopped";

      const agent2 = await orchestrator.spawn({ issue, repoPath: "/test/repo" });

      expect(agent2).not.toBe(agent1);
      expect(orchestrator.getAgent("TEST-123")).toBe(agent2);
    });
  });

  describe("sendMessage", () => {
    it("sends message to running agent", async () => {
      const MockAdapter = createMockAdapterClass();
      orchestrator.registerAdapter("test", MockAdapter);

      const issue = createMockIssue();
      const agent = await orchestrator.spawn({ issue, repoPath: "/test/repo" });
      agent.state = "running";

      const sendSpy = vi.spyOn(agent, "sendMessage");
      await orchestrator.sendMessage("TEST-123", "Hello");

      expect(sendSpy).toHaveBeenCalledWith("Hello");
    });

    it("throws if no agent for issue", async () => {
      await expect(orchestrator.sendMessage("UNKNOWN-123", "Hello")).rejects.toThrow(
        "No agent found for issue UNKNOWN-123",
      );
    });

    it("throws if agent not running", async () => {
      const MockAdapter = createMockAdapterClass();
      orchestrator.registerAdapter("test", MockAdapter);

      const issue = createMockIssue();
      await orchestrator.spawn({ issue, repoPath: "/test/repo" });

      await expect(orchestrator.sendMessage("TEST-123", "Hello")).rejects.toThrow(
        "Agent for TEST-123 is not running (state: stopped)",
      );
    });
  });

  describe("registerSteeringRule", () => {
    it("registers a steering rule config", () => {
      const ruleConfig = {
        id: "test-rule",
        name: "Test Rule",
        description: "A test rule",
        reminder: "Test reminder",
      };

      orchestrator.registerSteeringRule(ruleConfig);
      const rules = orchestrator.getSteeringRules();

      expect(rules).toHaveLength(1);
      const rule = rules[0];
      expect(rule?.id).toBe("test-rule");
    });

    it("validates and normalizes the rule config", () => {
      const ruleConfig = {
        id: "test-rule",
        name: "Test Rule",
        description: "A test rule",
        reminder: "Static reminder",
        // Omit optional fields to test defaults
      };

      orchestrator.registerSteeringRule(ruleConfig);
      const rules = orchestrator.getSteeringRules();

      const rule = rules[0];
      expect(rule?.priority).toBe(0); // default
      expect(rule?.once).toBe(false); // default
      expect(rule?.condition.status).toEqual([]); // default
    });
  });

  describe("shutdown with agents", () => {
    it("stops all tracked agents", async () => {
      const MockAdapter = createMockAdapterClass();
      orchestrator.registerAdapter("test", MockAdapter);

      const issue1 = createMockIssue("TEST-1");
      const issue2 = createMockIssue("TEST-2");

      const agent1 = await orchestrator.spawn({ issue: issue1, repoPath: "/test/repo" });
      const agent2 = await orchestrator.spawn({ issue: issue2, repoPath: "/test/repo" });

      const stop1 = vi.spyOn(agent1, "stop");
      const stop2 = vi.spyOn(agent2, "stop");

      await orchestrator.shutdown();

      expect(stop1).toHaveBeenCalled();
      expect(stop2).toHaveBeenCalled();
      expect(orchestrator.getAll()).toHaveLength(0);
    });

    it("handles errors during agent stop gracefully", async () => {
      const MockAdapter = createMockAdapterClass();
      orchestrator.registerAdapter("test", MockAdapter);

      const issue = createMockIssue();
      const agent = await orchestrator.spawn({ issue, repoPath: "/test/repo" });

      vi.spyOn(agent, "stop").mockRejectedValue(new Error("Stop failed"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Should not throw
      await orchestrator.shutdown();

      expect(errorSpy).toHaveBeenCalled();
      expect(orchestrator.getAll()).toHaveLength(0);
      errorSpy.mockRestore();
    });
  });

  describe("tool registration warnings", () => {
    it("warns when registering duplicate tool", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const tool: OrchestratorTool = {
        name: "duplicate",
        description: "First",
        schema: { type: "object" },
        execute: vi.fn(),
      };

      orchestrator.registerTool(tool);
      orchestrator.registerTool({ ...tool, description: "Second" });

      expect(warnSpy).toHaveBeenCalledWith('Tool "duplicate" already registered');
      warnSpy.mockRestore();
    });
  });
});
