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
        plugins: { enabled: [] },
        steering: { enabled: false, debounceMs: 500, maxReminders: 3, cooldownMs: 60000 },
      },
      ...overrides,
    };
  }

  it("returns a Monitor instance", () => {
    const monitor = createAgentHealthMonitor({ interval: 5000 });
    expect(monitor).toBeDefined();
    expect(typeof monitor.start).toBe("function");
    expect(typeof monitor.stop).toBe("function");
    expect(typeof monitor.poll).toBe("function");
  });

  it("creates monitor with id 'agent-health'", () => {
    const monitor = createAgentHealthMonitor({ interval: 5000 });
    expect(monitor.id).toBe("agent-health");
  });

  it("creates monitor with type 'local'", () => {
    const monitor = createAgentHealthMonitor({ interval: 5000 });
    expect(monitor.type).toBe("local");
  });

  it("uses the provided interval", () => {
    const monitor = createAgentHealthMonitor({ interval: 5000 });
    expect(monitor.interval).toBe(5000);
  });

  it("poll returns hasChanges: false (stub)", async () => {
    const monitor = createAgentHealthMonitor({ interval: 5000 });
    const result = await monitor.poll(createMockContext());
    expect(result).toEqual({ hasChanges: false });
  });

  it("accepts port option for Opencode", () => {
    const monitor = createAgentHealthMonitor({ interval: 5000, port: 3000 });
    expect(monitor.id).toBe("agent-health");
  });

  it("accepts pid option for process checking", () => {
    const monitor = createAgentHealthMonitor({ interval: 5000, pid: 12345 });
    expect(monitor.id).toBe("agent-health");
  });

  it.fails("TODO: detect crashed agent and emit agent.crashed", () => {
    // Full implementation (Harness step) will check port/PID, return hasChanges: true,
    // and trigger agent.crashed hook if unhealthy.
    expect(true).toBe(false);
  });
});
