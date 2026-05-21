/**
 * Tests for SteeringContext (notifications and toolHistory).
 * Split from rule.test.ts to keep files under 500 lines.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  baseIssue,
  createMockHooks,
  createMockNotification,
  createRule,
  defaultSteeringConfig,
} from "./fixtures.ts";

/** Helper to trigger evaluation by emitting idle event and advancing timers */
async function triggerEvaluation(
  hooks: ReturnType<typeof createMockHooks>,
  issueId = "AM-123",
) {
  hooks.emit("agent.idle", {
    issueId,
    status: "implementing",
    source: "test-source",
  });
  await vi.advanceTimersByTimeAsync(defaultSteeringConfig.debounceMs + 10);
}

describe("SteeringContext.notifications", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes notifications to when() callback", async () => {
    const hooks = createMockHooks();
    const mockNotifications = [
      createMockNotification({
        id: "notif-1",
        source: "test",
        title: "Test notification",
        status: "unread",
      }),
      createMockNotification({
        id: "notif-2",
        source: "test",
        title: "Another notification",
        status: "unread",
      }),
    ];
    const getNotifications = vi.fn().mockResolvedValue(mockNotifications);
    const whenFn = vi.fn().mockReturnValue(true);

    const rule = createRule(
      {
        id: "test:notifications",
        name: "Notifications",
        description: "",
        condition: { when: whenFn },
        reminder: "x",
      },
      hooks,
      baseIssue,
      defaultSteeringConfig,
      getNotifications,
    );

    await triggerEvaluation(hooks);

    expect(getNotifications).toHaveBeenCalled();
    expect(whenFn).toHaveBeenCalledWith(
      expect.objectContaining({
        notifications: mockNotifications,
      }),
    );

    rule.dispose();
  });

  it("can filter notifications in when() condition", async () => {
    const hooks = createMockHooks();
    const mockNotifications = [
      createMockNotification({
        id: "notif-1",
        source: "github",
        status: "unread",
      }),
      createMockNotification({
        id: "notif-2",
        source: "jira",
        status: "acknowledged",
      }),
    ];

    const rule = createRule(
      {
        id: "test:notif-filter",
        name: "Notification Filter",
        description: "",
        condition: {
          when: (ctx) =>
            ctx.notifications.some(
              (n) => n.source === "github" && n.status === "unread",
            ),
        },
        reminder: "Check GitHub notifications",
      },
      hooks,
      baseIssue,
      defaultSteeringConfig,
      async () => mockNotifications,
    );

    await triggerEvaluation(hooks);

    expect(hooks.emit).toHaveBeenCalledWith(
      "steering.reminder",
      expect.objectContaining({
        reminder: expect.stringContaining("Check GitHub notifications"),
      }),
    );

    rule.dispose();
  });

  it("does not emit when notification filter fails", async () => {
    const hooks = createMockHooks();
    const mockNotifications = [
      createMockNotification({
        id: "notif-1",
        source: "jira",
        status: "acknowledged",
      }),
    ];

    const rule = createRule(
      {
        id: "test:notif-filter-fail",
        name: "Notification Filter Fail",
        description: "",
        condition: {
          when: (ctx) =>
            ctx.notifications.some(
              (n) => n.source === "github" && n.status === "unread",
            ),
        },
        reminder: "x",
      },
      hooks,
      baseIssue,
      defaultSteeringConfig,
      async () => mockNotifications,
    );

    await triggerEvaluation(hooks);

    expect(hooks.emit).not.toHaveBeenCalledWith(
      "steering.reminder",
      expect.anything(),
    );

    rule.dispose();
  });
});

describe("SteeringContext.toolHistory", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tracks tool calls for this issue and passes to when()", async () => {
    const hooks = createMockHooks();
    const whenFn = vi.fn().mockReturnValue(true);

    const rule = createRule(
      {
        id: "test:tools",
        name: "Tools",
        description: "",
        condition: { when: whenFn },
        reminder: "x",
      },
      hooks,
    );

    // Simulate tool calls
    hooks.emit("agent.tool_call", {
      issueId: "AM-123",
      tool: "edit",
      args: { file: "test.ts" },
    });
    hooks.emit("agent.tool_call", {
      issueId: "AM-123",
      tool: "write",
      args: { file: "new.ts" },
    });

    await triggerEvaluation(hooks);

    expect(whenFn).toHaveBeenCalledWith(
      expect.objectContaining({
        toolHistory: expect.arrayContaining([
          expect.objectContaining({ name: "edit" }),
          expect.objectContaining({ name: "write" }),
        ]),
      }),
    );

    rule.dispose();
  });

  it("ignores tool calls for other issues", async () => {
    const hooks = createMockHooks();
    const whenFn = vi.fn().mockReturnValue(true);

    const rule = createRule(
      {
        id: "test:tools-other",
        name: "Tools Other",
        description: "",
        condition: { when: whenFn },
        reminder: "x",
      },
      hooks,
    );

    // Tool call for different issue
    hooks.emit("agent.tool_call", {
      issueId: "OTHER-456",
      tool: "edit",
      args: { file: "test.ts" },
    });

    await triggerEvaluation(hooks);

    expect(whenFn).toHaveBeenCalledWith(
      expect.objectContaining({
        toolHistory: [],
      }),
    );

    rule.dispose();
  });

  it("can filter tool history in when() condition", async () => {
    const hooks = createMockHooks();
    const rule = createRule(
      {
        id: "test:tools-filter",
        name: "Tools Filter",
        description: "",
        condition: {
          when: (ctx) =>
            ctx.toolHistory.some((t) => ["edit", "write"].includes(t.name)),
        },
        reminder: "Code changes detected",
      },
      hooks,
    );

    // Simulate tool call
    hooks.emit("agent.tool_call", {
      issueId: "AM-123",
      tool: "edit",
      args: {},
    });

    await triggerEvaluation(hooks);

    expect(hooks.emit).toHaveBeenCalledWith(
      "steering.reminder",
      expect.objectContaining({
        reminder: expect.stringContaining("Code changes detected"),
      }),
    );

    rule.dispose();
  });

  it("does not prune tool history (consumers filter by timestamp)", async () => {
    const hooks = createMockHooks();
    const whenFn = vi.fn().mockReturnValue(true);

    const rule = createRule(
      {
        id: "test:tools-no-limit",
        name: "Tools No Limit",
        description: "",
        condition: { when: whenFn },
        reminder: "x",
      },
      hooks,
    );

    // Simulate 25 tool calls
    for (let i = 0; i < 25; i++) {
      hooks.emit("agent.tool_call", {
        issueId: "AM-123",
        tool: `tool-${i}`,
        args: {},
      });
    }

    await triggerEvaluation(hooks);

    const ctx = whenFn.mock.calls[0]?.[0] as {
      toolHistory: Array<{ name: string }>;
    };
    expect(ctx).toBeDefined();
    // All 25 tools should be present (no pruning)
    expect(ctx.toolHistory).toHaveLength(25);
    expect(ctx.toolHistory[0]?.name).toBe("tool-0");
    expect(ctx.toolHistory[24]?.name).toBe("tool-24");

    rule.dispose();
  });
});
