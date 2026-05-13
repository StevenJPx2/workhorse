import { hooks } from "../index.ts";
import type { HookEventMap } from "../types.ts";

describe("hooks", () => {
  test("registers and calls handlers", () => {
    const received: Array<HookEventMap["issue.parsed"]> = [];
    const handler = (e: HookEventMap["issue.parsed"]) => received.push(e);

    hooks.on("issue.parsed", handler);
    hooks.emit("issue.parsed", {
      issue: {
        id: "1",
        externalId: "JIRA-1",
        source: "jira",
        repository: null,
        title: "Test",
        description: "",
        status: "pending",
        issueType: "bug",
        url: null,
        assignee: null,
        labels: null,
        metadata: {},
        worktreePath: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      raw: { key: "JIRA-1" },
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.issue.id).toBe("1");
    expect(received[0]!.raw).toEqual({ key: "JIRA-1" });

    hooks.off("issue.parsed", handler);
  });

  test("off() removes handler", () => {
    let called = false;
    const handler = () => {
      called = true;
    };

    hooks.on("plugin.loaded", handler);
    hooks.off("plugin.loaded", handler);
    hooks.emit("plugin.loaded", { name: "test" });

    expect(called).toBe(false);
  });

  test('wildcard "*" receives all events', () => {
    const events: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (type: any) => {
      events.push(type);
    };

    hooks.on("*", handler);
    hooks.emit("plugin.loaded", { name: "jira" });
    hooks.emit("monitor.registered", { name: "jira-poller", type: "remote" });

    expect(events).toEqual(["plugin.loaded", "monitor.registered"]);

    hooks.off("*", handler);
  });

  test("all.clear() removes everything", () => {
    let called = false;
    hooks.on("agent.crashed", () => {
      called = true;
    });
    hooks.all.clear();
    hooks.emit("agent.crashed", {
      issueId: "test-1",
      error: new Error("test"),
    });

    expect(called).toBe(false);
  });

  test.skip("TODO: implement once() for single-fire handlers", () => {
    // This test documents planned behavior that is not yet implemented.
    // hooks.once() should register a handler that fires only once then auto-removes.
    let callCount = 0;
    // @ts-expect-error - once method doesn't exist yet
    hooks.once("plugin.loaded", () => {
      callCount++;
    });

    hooks.emit("plugin.loaded", { name: "first" });
    hooks.emit("plugin.loaded", { name: "second" });

    // Expected: handler should have been called only once
    expect(callCount).toBe(1);
  });
});
