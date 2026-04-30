/**
 * Tests for SteeringRule class.
 *
 * Rules are autonomous - they subscribe to idle events and evaluate themselves.
 * Tests trigger evaluation by emitting agent.idle and advancing timers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baseIssue, createMockHooks, createRule, defaultSteeringConfig } from "./fixtures.ts";

describe("SteeringRule", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Helper to trigger evaluation by emitting idle event and advancing timers */
  async function triggerEvaluation(hooks: ReturnType<typeof createMockHooks>, issueId = "AM-123") {
    hooks.emit("agent.idle", {
      issueId,
      status: "implementing",
      source: "test-source",
    });
    await vi.advanceTimersByTimeAsync(defaultSteeringConfig.debounceMs + 10);
  }

  describe("constructor", () => {
    it("sets config properties", () => {
      const hooks = createMockHooks();
      const rule = createRule(
        {
          id: "test:config",
          name: "Config Test",
          description: "Test description",
          reminder: "Test reminder",
          priority: 5,
          once: true,
        },
        hooks,
      );

      expect(rule.id).toBe("test:config");
      expect(rule.name).toBe("Config Test");
      expect(rule.description).toBe("Test description");
      expect(rule.priority).toBe(5);
      expect(rule.once).toBe(true);
      expect(rule.issue.externalId).toBe("AM-123");

      rule.dispose();
    });

    it("uses defaults for optional properties", () => {
      const hooks = createMockHooks();
      const rule = createRule(
        {
          id: "test:defaults",
          name: "Defaults",
          description: "",
          reminder: "x",
        },
        hooks,
      );

      expect(rule.priority).toBe(0);
      expect(rule.once).toBe(false);

      rule.dispose();
    });

    it("subscribes to idle events", () => {
      const hooks = createMockHooks();
      const rule = createRule(
        {
          id: "test:idle-sub",
          name: "Idle Sub",
          description: "",
          reminder: "test",
        },
        hooks,
      );

      expect(hooks.on).toHaveBeenCalledWith("agent.idle", expect.any(Function));

      rule.dispose();
    });

    it("subscribes to hooks specified in condition", () => {
      const hooks = createMockHooks();
      const rule = createRule(
        {
          id: "test:hook-sub",
          name: "Hook Sub",
          description: "",
          condition: { hook: "test:custom.event" },
          reminder: "test",
        },
        hooks,
      );

      expect(hooks.on).toHaveBeenCalledWith("test:custom.event", expect.any(Function));

      rule.dispose();
    });
  });

  describe("evaluation via idle events", () => {
    it("emits reminder when conditions match", async () => {
      const hooks = createMockHooks();
      const rule = createRule(
        { id: "test:emit", name: "Emit", description: "", reminder: "Hello!" },
        hooks,
      );

      await triggerEvaluation(hooks);

      expect(hooks.emit).toHaveBeenCalledWith(
        "steering.reminder",
        expect.objectContaining({
          issueId: "AM-123",
          reminder: expect.stringContaining("Hello!"),
        }),
      );

      rule.dispose();
    });

    it("ignores idle events for other issues", async () => {
      const hooks = createMockHooks();
      const rule = createRule(
        { id: "test:other", name: "Other", description: "", reminder: "test" },
        hooks,
      );

      await triggerEvaluation(hooks, "OTHER-456");

      expect(hooks.emit).not.toHaveBeenCalledWith("steering.reminder", expect.anything());

      rule.dispose();
    });

    it("debounces rapid idle events", async () => {
      const hooks = createMockHooks();
      const rule = createRule(
        {
          id: "test:debounce",
          name: "Debounce",
          description: "",
          reminder: "test",
        },
        hooks,
      );

      // Fire multiple idle events rapidly
      hooks.emit("agent.idle", {
        issueId: "AM-123",
        status: "implementing",
        source: "test-source",
      });
      hooks.emit("agent.idle", {
        issueId: "AM-123",
        status: "implementing",
        source: "test-source",
      });
      hooks.emit("agent.idle", {
        issueId: "AM-123",
        status: "implementing",
        source: "test-source",
      });

      await vi.advanceTimersByTimeAsync(defaultSteeringConfig.debounceMs + 10);

      // Should only emit once
      const reminderCalls = (hooks.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => c[0] === "steering.reminder",
      );
      expect(reminderCalls).toHaveLength(1);

      rule.dispose();
    });

    it("does not emit when status condition fails", async () => {
      const hooks = createMockHooks();
      const rule = createRule(
        {
          id: "test:status-fail",
          name: "Status Fail",
          description: "",
          condition: { status: "done" },
          reminder: "test",
        },
        hooks,
        baseIssue, // status is "implementing"
      );

      await triggerEvaluation(hooks);

      expect(hooks.emit).not.toHaveBeenCalledWith("steering.reminder", expect.anything());

      rule.dispose();
    });

    it("does not emit when source condition fails", async () => {
      const hooks = createMockHooks();
      const rule = createRule(
        {
          id: "test:source-fail",
          name: "Source Fail",
          description: "",
          condition: { source: "other-source" },
          reminder: "test",
        },
        hooks,
        baseIssue, // source is "test-source"
      );

      await triggerEvaluation(hooks);

      expect(hooks.emit).not.toHaveBeenCalledWith("steering.reminder", expect.anything());

      rule.dispose();
    });

    it("does not emit when hook condition fails (no recent hook)", async () => {
      const hooks = createMockHooks();
      const rule = createRule(
        {
          id: "test:hook-fail",
          name: "Hook Fail",
          description: "",
          condition: { hook: "test:custom.event" },
          reminder: "test",
        },
        hooks,
      );

      // No hook fired, just idle
      await triggerEvaluation(hooks);

      expect(hooks.emit).not.toHaveBeenCalledWith("steering.reminder", expect.anything());

      rule.dispose();
    });

    it("emits when hook condition passes", async () => {
      const hooks = createMockHooks();
      const rule = createRule(
        {
          id: "test:hook-pass",
          name: "Hook Pass",
          description: "",
          condition: { hook: "test:custom.event" },
          reminder: "Event received!",
        },
        hooks,
      );

      // Simulate hook firing before idle
      hooks.emit("test:custom.event", { issueId: "AM-123" });
      await triggerEvaluation(hooks);

      expect(hooks.emit).toHaveBeenCalledWith(
        "steering.reminder",
        expect.objectContaining({
          reminder: expect.stringContaining("Event received!"),
        }),
      );

      rule.dispose();
    });

    it("does not emit when when() predicate returns false", async () => {
      const hooks = createMockHooks();
      const rule = createRule(
        {
          id: "test:when-fail",
          name: "When Fail",
          description: "",
          condition: { when: () => false },
          reminder: "test",
        },
        hooks,
      );

      await triggerEvaluation(hooks);

      expect(hooks.emit).not.toHaveBeenCalledWith("steering.reminder", expect.anything());

      rule.dispose();
    });

    it("passes rule instance to when() predicate", async () => {
      const hooks = createMockHooks();
      const whenFn = vi.fn().mockReturnValue(true);
      const rule = createRule(
        {
          id: "test:when-instance",
          name: "When Instance",
          description: "",
          condition: { when: whenFn },
          reminder: "test",
        },
        hooks,
      );

      await triggerEvaluation(hooks);

      expect(whenFn).toHaveBeenCalledWith(rule);

      rule.dispose();
    });

    it("calls reminder function with rule instance", async () => {
      const hooks = createMockHooks();
      const rule = createRule(
        {
          id: "test:fn-reminder",
          name: "Fn Reminder",
          description: "",
          reminder: (r) => `Issue: ${r.issue.externalId}`,
        },
        hooks,
      );

      await triggerEvaluation(hooks);

      expect(hooks.emit).toHaveBeenCalledWith(
        "steering.reminder",
        expect.objectContaining({
          reminder: expect.stringContaining("Issue: AM-123"),
        }),
      );

      rule.dispose();
    });

    it("skips once rule after it has fired", async () => {
      const hooks = createMockHooks();
      const rule = createRule(
        {
          id: "test:once-skip",
          name: "Once Skip",
          description: "",
          reminder: "x",
          once: true,
        },
        hooks,
      );

      await triggerEvaluation(hooks);

      // Clear mocks and trigger again
      (hooks.emit as ReturnType<typeof vi.fn>).mockClear();

      // Need to advance past cooldown too for second evaluation
      await vi.advanceTimersByTimeAsync(defaultSteeringConfig.cooldownMs);
      await triggerEvaluation(hooks);

      expect(hooks.emit).not.toHaveBeenCalledWith("steering.reminder", expect.anything());

      rule.dispose();
    });
  });

  describe("reset", () => {
    it("resets fired flag allowing once rule to fire again", async () => {
      const hooks = createMockHooks();
      const rule = createRule(
        {
          id: "test:reset",
          name: "Reset Test",
          description: "",
          reminder: "x",
          once: true,
        },
        hooks,
      );

      // Fire once
      await triggerEvaluation(hooks);
      expect(hooks.emit).toHaveBeenCalledWith("steering.reminder", expect.anything());

      // Clear mocks and advance past cooldown
      (hooks.emit as ReturnType<typeof vi.fn>).mockClear();
      await vi.advanceTimersByTimeAsync(defaultSteeringConfig.cooldownMs);

      // Reset the rule
      rule.reset();

      // Trigger again - should fire because reset cleared fired flag
      await triggerEvaluation(hooks);
      expect(hooks.emit).toHaveBeenCalledWith("steering.reminder", expect.anything());

      rule.dispose();
    });

    it("clears recent hooks", async () => {
      const hooks = createMockHooks();
      const rule = createRule(
        {
          id: "test:reset-hooks",
          name: "Reset Hooks",
          description: "",
          condition: { hook: "test:custom.event" },
          reminder: "Event received!",
        },
        hooks,
      );

      // Simulate hook firing
      hooks.emit("test:custom.event", { issueId: "AM-123" });

      // Reset clears recent hooks
      rule.reset();

      // Trigger evaluation - should NOT fire because recent hooks cleared
      await triggerEvaluation(hooks);
      expect(hooks.emit).not.toHaveBeenCalledWith("steering.reminder", expect.anything());

      rule.dispose();
    });
  });

  describe("dispose", () => {
    it("unsubscribes from hooks", () => {
      const hooks = createMockHooks();
      const rule = createRule(
        {
          id: "test:dispose",
          name: "Dispose",
          description: "",
          condition: { hook: "test:custom.event" },
          reminder: "x",
        },
        hooks,
      );

      rule.dispose();

      expect(hooks.off).toHaveBeenCalledWith("test:custom.event", expect.any(Function));
      expect(hooks.off).toHaveBeenCalledWith("agent.idle", expect.any(Function));
    });
  });
});
