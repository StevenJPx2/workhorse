/**
 * Tests for SteeringService mechanics.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
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

  beforeEach(() => {
    hooks = createMockHooks();
    const db = createMockDb(baseIssue);
    const memory = createMockMemory();
    service = new SteeringService(db, memory, hooks, fastConfig);
  });

  describe("registerRule / unregisterRule", () => {
    it("registers and returns a rule", () => {
      const rule: SteeringRule = {
        id: "test:rule",
        name: "Test Rule",
        description: "A test rule",
        condition: {},
        reminder: "Hello!",
      };

      service.registerRule(rule);
      expect(service.getRules()).toContain(rule);
    });

    it("unregisters a rule by id", () => {
      const rule: SteeringRule = {
        id: "test:rule",
        name: "Test Rule",
        description: "A test rule",
        condition: {},
        reminder: "Hello!",
      };

      service.registerRule(rule);
      service.unregisterRule("test:rule");
      expect(service.getRules()).toHaveLength(0);
    });
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

      service.registerRule(rule);
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

      service.registerRule(rule);
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

      service.registerRule(rule);
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

      service.registerRule(rule);
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

      service.registerRule(rule);
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

      service.registerRule(rule);
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

      service.registerRule(rule);
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

    it("resets when resetForIssue is called", async () => {
      const rule: SteeringRule = {
        id: "test:once-reset",
        name: "Once Reset",
        description: "",
        condition: {},
        reminder: "Once!",
        once: true,
      };

      service.registerRule(rule);
      hooks.emit("agent.idle", {
        issueId: "AM-123",
        status: "implementing",
        source: "jira",
      });
      await new Promise((r) => setTimeout(r, 10));

      vi.clearAllMocks();
      service.resetForIssue("AM-123");

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
    });
  });

  describe("disabled steering", () => {
    it("does not emit reminders when disabled", async () => {
      const disabledHooks = createMockHooks();
      const disabledService = new SteeringService(
        createMockDb(baseIssue),
        createMockMemory(),
        disabledHooks,
        { ...fastConfig, enabled: false },
      );

      disabledService.registerRule({
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
    });
  });

  describe("hook condition", () => {
    it("fires when specified hook recently fired", async () => {
      const rule: SteeringRule = {
        id: "test:hook-condition",
        name: "Hook Condition",
        description: "",
        condition: { hook: "github:pr.merged" },
        reminder: "PR was merged!",
      };

      service.registerRule(rule);
      hooks.emit("github:pr.merged", { issueId: "AM-123", pr: { number: 42 } });
      hooks.emit("agent.idle", {
        issueId: "AM-123",
        status: "implementing",
        source: "jira",
      });
      await new Promise((r) => setTimeout(r, 10));

      expect(hooks.emit).toHaveBeenCalledWith(
        "steering.reminder",
        expect.objectContaining({
          reminder: expect.stringContaining("PR was merged!"),
        }),
      );
    });

    it("does not fire when specified hook did not fire", async () => {
      const rule: SteeringRule = {
        id: "test:hook-no-match",
        name: "Hook No Match",
        description: "",
        condition: { hook: "github:pr.merged" },
        reminder: "Should not fire",
      };

      service.registerRule(rule);
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
