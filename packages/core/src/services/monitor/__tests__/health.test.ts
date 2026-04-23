import mitt from "mitt";
import { describe, expect, it } from "vitest";
import type { HookEventMap } from "#lib/hooks";
import { createAgentHealthMonitor } from "../health.ts";
import type { MonitorContext } from "../types.ts";

describe("createAgentHealthMonitor", () => {
  function createMockContext(overrides: Partial<MonitorContext> = {}): MonitorContext {
    return {
      issueId: "AM-123",
      hooks: mitt<HookEventMap>(),
      memory: {} as MonitorContext["memory"],
      config: {
        behavior: { pollInterval: 5000, autoResume: true },
        agent: { harness: "claude-code" },
        prompt: {},
        ui: { theme: "default" },
        plugins: { enabled: [], directories: [] },
      },
      ...overrides,
    };
  }

  it("creates a monitor factory", () => {
    const factory = createAgentHealthMonitor();
    expect(typeof factory).toBe("function");
  });

  it("creates monitor with name 'agent-health'", () => {
    const factory = createAgentHealthMonitor();
    const monitor = factory(createMockContext());
    expect(monitor.name).toBe("agent-health");
  });

  it("creates monitor with type 'local'", () => {
    const factory = createAgentHealthMonitor();
    const monitor = factory(createMockContext());
    expect(monitor.type).toBe("local");
  });

  it("uses config.behavior.pollInterval as default interval", () => {
    const factory = createAgentHealthMonitor();
    const ctx = createMockContext();
    const monitor = factory(ctx);
    expect(monitor.interval).toBe(5000);
  });

  it("uses custom checkInterval when provided", () => {
    const factory = createAgentHealthMonitor({ checkInterval: 2000 });
    const monitor = factory(createMockContext());
    expect(monitor.interval).toBe(2000);
  });

  it("poll returns hasChanges: false (stub)", async () => {
    const factory = createAgentHealthMonitor();
    const monitor = factory(createMockContext());
    const result = await monitor.poll();
    expect(result).toEqual({ hasChanges: false });
  });

  it("accepts port option for Opencode", () => {
    const factory = createAgentHealthMonitor({ port: 3000 });
    const monitor = factory(createMockContext());
    // Just verifies it doesn't throw - port is stored for future use
    expect(monitor.name).toBe("agent-health");
  });

  it("accepts pid option for process checking", () => {
    const factory = createAgentHealthMonitor({ pid: 12345 });
    const monitor = factory(createMockContext());
    // Just verifies it doesn't throw - pid is stored for future use
    expect(monitor.name).toBe("agent-health");
  });

  it.fails("TODO: detect crashed agent and emit agent.crashed", () => {
    // Full implementation (Harness step) will check port/PID, return hasChanges: true,
    // and trigger agent.crashed hook if unhealthy.
    expect(true).toBe(false);
  });
});
