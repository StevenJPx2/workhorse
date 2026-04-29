/**
 * Tests for SteeringService (per-issue) mechanics.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SteeringService } from "../service.ts";
import {
  baseIssue,
  createMockDb,
  createMockHooks,
  createMockMemory,
  fastConfig,
} from "./fixtures.ts";
import type { SteeringRule } from "../types.ts";

describe("SteeringService", () => {
  let service: SteeringService;
  let hooks: ReturnType<typeof createMockHooks>;
  let rules: SteeringRule[];

  beforeEach(() => {
    hooks = createMockHooks();
    const db = createMockDb(baseIssue);
    const memory = createMockMemory();
    rules = [];

    // Create per-issue service with a getRules getter
    service = new SteeringService(baseIssue, db, memory, hooks, fastConfig, () => rules);
  });

  afterEach(() => {
    service.dispose();
  });

  describe("status condition", () => {
    it("fires when status matches", async () => {
      const rule: SteeringRule = {
        id: "test:status-match",
        name: "Status Match",
        description: "",
        condition: { status: "implementing" },
        reminder: "Status matched!",
      };

      rules.push(rule);
      hooks.emit("agent.idle", {
        issueId: "AM-123",
        status: "implementing",
        source: "jira",
      });
      await new Promise((r) => setTimeout(r, 10));

      expect(hooks.emit).toHaveBeenCalledWith(
        "steering.reminder",
        expect.objectContaining({
          reminder: expect.stringContaining("Status matched!"),
        }),
      );
    });

    it("does not fire when status does not match", async () => {
      const rule: SteeringRule = {
        id: "test:status-no-match",
        name: "Status No Match",
        description: "",
        condition: { status: "done" },
        reminder: "Should not fire",
      };

      rules.push(rule);
      hooks.emit("agent.idle", {
        issueId: "AM-123",
        status: "implementing",
        source: "jira",
      });
      await new Promise((r) => setTimeout(r, 10));

      expect(hooks.emit).not.toHaveBeenCalledWith(
        "steering.reminder",
        expect.objectContaining({
          reminder: expect.stringContaining("Should not fire"),
        }),
      );
    });
  });

  describe("source condition", () => {
    it("fires when source matches", async () => {
      const rule: SteeringRule = {
        id: "test:source-match",
        name: "Source Match",
        description: "",
        condition: { source: "jira" },
        reminder: "Source matched!",
      };

      rules.push(rule);
      hooks.emit("agent.idle", {
        issueId: "AM-123",
        status: "implementing",
        source: "jira",
      });
      await new Promise((r) => setTimeout(r, 10));

      expect(hooks.emit).toHaveBeenCalledWith(
        "steering.reminder",
        expect.objectContaining({
          reminder: expect.stringContaining("Source matched!"),
        }),
      );
    });

    it("does not fire when source does not match", async () => {
      const rule: SteeringRule = {
        id: "test:source-no-match",
        name: "Source No Match",
        description: "",
        condition: { source: "github" },
        reminder: "Should not fire",
      };

      rules.push(rule);
      hooks.emit("agent.idle", {
        issueId: "AM-123",
        status: "implementing",
        source: "jira",
      });
      await new Promise((r) => setTimeout(r, 10));

      expect(hooks.emit).not.toHaveBeenCalledWith(
        "steering.reminder",
        expect.objectContaining({
          reminder: expect.stringContaining("Should not fire"),
        }),
      );
    });
  });

  describe("custom predicate (when)", () => {
    it("fires when predicate returns true", async () => {
      const rule: SteeringRule = {
        id: "test:when-true",
        name: "When True",
        description: "",
        condition: { when: () => true },
        reminder: "Predicate true!",
      };

      rules.push(rule);
      hooks.emit("agent.idle", {
        issueId: "AM-123",
        status: "implementing",
        source: "jira",
      });
      await new Promise((r) => setTimeout(r, 10));

      expect(hooks.emit).toHaveBeenCalledWith(
        "steering.reminder",
        expect.objectContaining({
          reminder: expect.stringContaining("Predicate true!"),
        }),
      );
    });

    it("does not fire when predicate returns false", async () => {
      const rule: SteeringRule = {
        id: "test:when-false",
        name: "When False",
        description: "",
        condition: { when: () => false },
        reminder: "Should not fire",
      };

      rules.push(rule);
      hooks.emit("agent.idle", {
        issueId: "AM-123",
        status: "implementing",
        source: "jira",
      });
      await new Promise((r) => setTimeout(r, 10));

      expect(hooks.emit).not.toHaveBeenCalledWith(
        "steering.reminder",
        expect.objectContaining({
          reminder: expect.stringContaining("Should not fire"),
        }),
      );
    });
  });

  describe("once-per-session", () => {
    it("fires once and then skips on subsequent idle events", async () => {
      const rule: SteeringRule = {
        id: "test:once",
        name: "Once Rule",
        description: "",
        condition: {},
        reminder: "Once!",
        once: true,
      };

      rules.push(rule);
      hooks.emit("agent.idle", {
        issueId: "AM-123",
        status: "implementing",
        source: "jira",
      });
      await new Promise((r) => setTimeout(r, 10));

      expect(hooks.emit).toHaveBeenCalledWith(
        "steering.reminder",
        expect.objectContaining({ reminder: expect.stringContaining("Once!") }),
      );

      vi.clearAllMocks();
      hooks.emit("agent.idle", {
        issueId: "AM-123",
        status: "implementing",
        source: "jira",
      });
      await new Promise((r) => setTimeout(r, 10));

      const steeringCalls = (hooks.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0] === "steering.reminder",
      );
      expect(steeringCalls).toHaveLength(0);
    });

    it("new service instance starts with fresh state", async () => {
      const rule: SteeringRule = {
        id: "test:once-reset",
        name: "Once Reset",
        description: "",
        condition: {},
        reminder: "Once!",
        once: true,
      };

      rules.push(rule);
      hooks.emit("agent.idle", {
        issueId: "AM-123",
        status: "implementing",
        source: "jira",
      });
      await new Promise((r) => setTimeout(r, 10));

      // First service fires
      expect(hooks.emit).toHaveBeenCalledWith(
        "steering.reminder",
        expect.objectContaining({ reminder: expect.stringContaining("Once!") }),
      );

      vi.clearAllMocks();
      service.dispose();

      // Create new service instance (simulates new agent spawn)
      const newHooks = createMockHooks();
      const newService = new SteeringService(
        baseIssue,
        createMockDb(baseIssue),
        createMockMemory(),
        newHooks,
        fastConfig,
        () => rules,
      );

      newHooks.emit("agent.idle", {
        issueId: "AM-123",
        status: "implementing",
        source: "jira",
      });
      await new Promise((r) => setTimeout(r, 10));

      // New service should fire (fresh state)
      expect(newHooks.emit).toHaveBeenCalledWith(
        "steering.reminder",
        expect.objectContaining({ reminder: expect.stringContaining("Once!") }),
      );

      newService.dispose();
    });
  });

  describe("disabled steering", () => {
    it("does not emit reminders when disabled", async () => {
      const disabledHooks = createMockHooks();
      const disabledService = new SteeringService(
        baseIssue,
        createMockDb(baseIssue),
        createMockMemory(),
        disabledHooks,
        { ...fastConfig, enabled: false },
        () => rules,
      );

      rules.push({
        id: "test:disabled",
        name: "Disabled",
        description: "",
        condition: {},
        reminder: "Should not fire",
      });
      disabledHooks.emit("agent.idle", {
        issueId: "AM-123",
        status: "implementing",
        source: "jira",
      });
      await new Promise((r) => setTimeout(r, 10));

      expect(disabledHooks.emit).not.toHaveBeenCalledWith("steering.reminder", expect.anything());
      disabledService.dispose();
    });
  });

  describe("issue filtering", () => {
    it("ignores idle events for other issues", async () => {
      const rule: SteeringRule = {
        id: "test:filter",
        name: "Filter Test",
        description: "",
        condition: {},
        reminder: "Should not fire for other issue",
      };

      rules.push(rule);

      // Emit for a different issue
      hooks.emit("agent.idle", {
        issueId: "OTHER-456",
        status: "implementing",
        source: "jira",
      });
      await new Promise((r) => setTimeout(r, 10));

      expect(hooks.emit).not.toHaveBeenCalledWith(
        "steering.reminder",
        expect.objectContaining({
          reminder: expect.stringContaining("Should not fire"),
        }),
      );
    });
  });

  describe("hook condition", () => {
    it("fires when specified hook recently fired", async () => {
      // Register rule with hook condition first (before creating service to trigger tracking)
      const rule: SteeringRule = {
        id: "test:hook-condition",
        name: "Hook Condition",
        description: "",
        condition: { hook: "github:pr.merged" },
        reminder: "PR was merged!",
      };
      rules.push(rule);

      // Create new service that will set up hook tracking
      service.dispose();
      const newHooks = createMockHooks();
      const newService = new SteeringService(
        baseIssue,
        createMockDb(baseIssue),
        createMockMemory(),
        newHooks,
        fastConfig,
        () => rules,
      );

      // Emit the tracked hook event first
      newHooks.emit("github:pr.merged", { issueId: "AM-123", pr: { number: 42 } });

      // Then emit idle
      newHooks.emit("agent.idle", {
        issueId: "AM-123",
        status: "implementing",
        source: "jira",
      });
      await new Promise((r) => setTimeout(r, 10));

      expect(newHooks.emit).toHaveBeenCalledWith(
        "steering.reminder",
        expect.objectContaining({
          reminder: expect.stringContaining("PR was merged!"),
        }),
      );

      newService.dispose();
    });

    it("does not fire when specified hook did not fire", async () => {
      const rule: SteeringRule = {
        id: "test:hook-no-match",
        name: "Hook No Match",
        description: "",
        condition: { hook: "github:pr.merged" },
        reminder: "Should not fire",
      };
      rules.push(rule);

      // Create new service that will set up hook tracking
      service.dispose();
      const newHooks = createMockHooks();
      const newService = new SteeringService(
        baseIssue,
        createMockDb(baseIssue),
        createMockMemory(),
        newHooks,
        fastConfig,
        () => rules,
      );

      // Don't emit the hook, just go idle
      newHooks.emit("agent.idle", {
        issueId: "AM-123",
        status: "implementing",
        source: "jira",
      });
      await new Promise((r) => setTimeout(r, 10));

      expect(newHooks.emit).not.toHaveBeenCalledWith(
        "steering.reminder",
        expect.objectContaining({
          reminder: expect.stringContaining("Should not fire"),
        }),
      );

      newService.dispose();
    });
  });

  describe("dispose", () => {
    it("stops processing after dispose", async () => {
      const rule: SteeringRule = {
        id: "test:dispose",
        name: "Dispose Test",
        description: "",
        condition: {},
        reminder: "Should not fire after dispose",
      };

      rules.push(rule);
      service.dispose();

      hooks.emit("agent.idle", {
        issueId: "AM-123",
        status: "implementing",
        source: "jira",
      });
      await new Promise((r) => setTimeout(r, 10));

      expect(hooks.emit).not.toHaveBeenCalledWith(
        "steering.reminder",
        expect.objectContaining({
          reminder: expect.stringContaining("Should not fire"),
        }),
      );
    });
  });

  it.skip("TODO: respects maxReminders limit", async () => {
    throw new Error("Not yet implemented");
  });
});
