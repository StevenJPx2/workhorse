import { describe, expect, it } from "vitest";

import type { MonitorContext } from "#services";
import { createMockHooks } from "#test-helpers";

import { createAgentHealthMonitor } from "../health.ts";

describe("createAgentHealthMonitor", () => {
  function createMockContext(overrides: Partial<MonitorContext> = {}): MonitorContext {
    return {
      issueId: "AM-123",
      hooks: createMockHooks(),
      memory: {} as MonitorContext["memory"],
      config: {
        behavior: { pollInterval: 5000, autoResume: true },
        agent: { harness: "claude-code" },
        prompt: {},
        ui: { theme: "default" },
        plugins: { disabled: [] },
        steering: { enabled: false, debounceMs: 500, maxReminders: 3, cooldownMs: 60000 },
      },
      ...overrides,
    };
  }

  it("returns PollingMonitorOptions", () => {
    const options = createAgentHealthMonitor({ interval: 5000 });
    expect(options).toBeDefined();
    expect(options.id).toBe("agent-health");
    expect(options.type).toBe("polling");
    expect(typeof options.poll).toBe("function");
  });

  it("creates monitor with id 'agent-health'", () => {
    const options = createAgentHealthMonitor({ interval: 5000 });
    expect(options.id).toBe("agent-health");
  });

  it("creates monitor with type 'polling'", () => {
    const options = createAgentHealthMonitor({ interval: 5000 });
    expect(options.type).toBe("polling");
  });

  it("uses the provided interval", () => {
    const options = createAgentHealthMonitor({ interval: 5000 });
    expect(options.interval).toBe(5000);
  });

  it("poll returns hasChanges: false (stub)", async () => {
    const options = createAgentHealthMonitor({ interval: 5000 });
    const result = await options.poll(createMockContext());
    expect(result).toEqual({ hasChanges: false });
  });

  it("accepts port option for Opencode", () => {
    const options = createAgentHealthMonitor({ interval: 5000, port: 3000 });
    expect(options.id).toBe("agent-health");
  });

  it("accepts pid option for process checking", () => {
    const options = createAgentHealthMonitor({ interval: 5000, pid: 12345 });
    expect(options.id).toBe("agent-health");
  });

  it.fails("TODO: detect crashed agent and emit agent.crashed", () => {
    // Full implementation (Harness step) will check port/PID, return hasChanges: true,
    // and trigger agent.crashed hook if unhealthy.
    expect(true).toBe(false);
  });
});
