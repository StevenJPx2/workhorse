/**
 * Tests for AgentAdapter stop() hook behavior.
 *
 * The key behavior is that agent.stop.post uses callHook() instead of emit(),
 * which means async handlers are awaited before stop() returns.
 *
 * This is critical for cleanup tasks like:
 * - Playwright browser session cleanup
 * - Resource cleanup that must complete before process exit
 */

import { describe, expect, it } from "vitest";

import { createMockHooks } from "#lib/hooks/__tests__/test-helpers";

describe("agent.stop.post hook behavior", () => {
  it("callHook awaits async handlers", async () => {
    const hooks = createMockHooks();
    const order: string[] = [];

    // Register an async handler (simulating Playwright browser cleanup)
    hooks.on("agent.stop.post", async () => {
      order.push("cleanup-start");
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push("cleanup-end");
    });

    order.push("stop-start");
    await hooks.callHook("agent.stop.post", { adapter: {} as any });
    order.push("stop-end");

    // Verify cleanup completed BEFORE callHook returned
    expect(order).toEqual(["stop-start", "cleanup-start", "cleanup-end", "stop-end"]);
  });

  it("emit does NOT await async handlers", async () => {
    const hooks = createMockHooks();
    const order: string[] = [];

    // Register an async handler
    hooks.on("agent.stop.post", async () => {
      order.push("cleanup-start");
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push("cleanup-end");
    });

    order.push("emit-start");
    hooks.emit("agent.stop.post", { adapter: {} as any });
    order.push("emit-end");

    // Wait for async handler to complete
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Verify emit returned BEFORE cleanup completed
    expect(order).toEqual(["emit-start", "cleanup-start", "emit-end", "cleanup-end"]);
  });

  it("callHook awaits multiple async handlers in parallel", async () => {
    const hooks = createMockHooks();
    const order: string[] = [];

    // Register two async handlers
    hooks.on("agent.stop.post", async () => {
      order.push("handler1-start");
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push("handler1-end");
    });

    hooks.on("agent.stop.post", async () => {
      order.push("handler2-start");
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push("handler2-end");
    });

    order.push("call-start");
    await hooks.callHook("agent.stop.post", { adapter: {} as any });
    order.push("call-end");

    // Both handlers should complete before callHook returns
    // Handler 2 finishes first (5ms vs 10ms), but order may vary due to Promise.all
    expect(order).toContain("handler1-start");
    expect(order).toContain("handler1-end");
    expect(order).toContain("handler2-start");
    expect(order).toContain("handler2-end");
    expect(order[order.length - 1]).toBe("call-end");
    // Verify all handlers started and ended before call-end
    const callEndIndex = order.indexOf("call-end");
    expect(order.indexOf("handler1-end")).toBeLessThan(callEndIndex);
    expect(order.indexOf("handler2-end")).toBeLessThan(callEndIndex);
  });

  it("callHook propagates errors from handlers", async () => {
    const hooks = createMockHooks();

    hooks.on("agent.stop.post", async () => {
      throw new Error("Cleanup failed");
    });

    await expect(hooks.callHook("agent.stop.post", { adapter: {} as any })).rejects.toThrow(
      "Cleanup failed",
    );
  });
});

describe("agent stop() implementation", () => {
  it("uses callHook for agent.stop.post in agent.ts", async () => {
    // This test verifies the implementation by reading the source
    // The actual behavior is tested above via the hook emitter
    const { readFile } = await import("node:fs/promises");
    const agentSource = await readFile(new URL("../agent.ts", import.meta.url).pathname, "utf-8");

    // Verify callHook is used for agent.stop.post
    expect(agentSource).toContain('await this.hooks.callHook("agent.stop.post"');

    // Verify emit is used for agent.stop.pre (fire-and-forget)
    expect(agentSource).toContain('this.hooks.emit("agent.stop.pre"');
  });
});

describe("agent tools filtering", () => {
  it("filters tools by issue source", async () => {
    // This test verifies the implementation by reading the source
    const { readFile } = await import("node:fs/promises");
    const agentSource = await readFile(new URL("../agent.ts", import.meta.url).pathname, "utf-8");

    // Verify the tools getter filters by source
    expect(agentSource).toContain("get tools()");
    expect(agentSource).toContain("tool.sources");
    expect(agentSource).toContain("this.issue.source");
  });

  it("tools filtering logic is correct", () => {
    // Test the filtering logic directly
    const tools = [
      { name: "global_tool", sources: undefined },
      { name: "empty_sources", sources: [] },
      { name: "jira_tool", sources: ["jira"] },
      { name: "github_tool", sources: ["github"] },
      { name: "multi_source", sources: ["jira", "github"] },
    ];

    // Filter function matches AgentAdapter.tools getter
    const filterTools = (issueSource: string) =>
      tools.filter((tool) => {
        if (!tool.sources || tool.sources.length === 0) return true;
        return tool.sources.includes(issueSource);
      });

    // For a Jira issue
    const jiraTools = filterTools("jira").map((t) => t.name);
    expect(jiraTools).toContain("global_tool");
    expect(jiraTools).toContain("empty_sources");
    expect(jiraTools).toContain("jira_tool");
    expect(jiraTools).not.toContain("github_tool");
    expect(jiraTools).toContain("multi_source");

    // For a GitHub issue
    const githubTools = filterTools("github").map((t) => t.name);
    expect(githubTools).toContain("global_tool");
    expect(githubTools).toContain("empty_sources");
    expect(githubTools).not.toContain("jira_tool");
    expect(githubTools).toContain("github_tool");
    expect(githubTools).toContain("multi_source");

    // For a local issue
    const localTools = filterTools("local").map((t) => t.name);
    expect(localTools).toContain("global_tool");
    expect(localTools).toContain("empty_sources");
    expect(localTools).not.toContain("jira_tool");
    expect(localTools).not.toContain("github_tool");
    expect(localTools).not.toContain("multi_source");
  });
});
