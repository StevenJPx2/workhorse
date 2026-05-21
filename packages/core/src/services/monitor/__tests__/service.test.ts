import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkhorseConfig } from "#config";
import type { HookEmitter } from "#lib";
import type { MemoryService } from "#services";
import { createMockHooks } from "#test-helpers";

import { MonitorService } from "../service.ts";
import type {
  EventMonitorOptions,
  MonitorContext,
  MonitorResult,
  PollingMonitorOptions,
} from "../types.ts";

export function createPollingMonitorOptions(
  id: string,
  options: {
    interval?: number;
    pollResult?: MonitorResult;
    pollFn?: (ctx: MonitorContext) => Promise<MonitorResult>;
  } = {},
): PollingMonitorOptions {
  const { interval = 1000, pollResult = { hasChanges: false } } = options;
  return {
    id,
    type: "polling",
    interval,
    poll: options.pollFn ?? (async () => pollResult),
  };
}

export function createEventMonitorOptions(
  id: string,
  options: {
    setupFn?: EventMonitorOptions["setup"];
  } = {},
): EventMonitorOptions {
  return {
    id,
    type: "event",
    setup:
      options.setupFn ??
      (async () => {
        return () => {};
      }),
  };
}

describe("MonitorService", () => {
  let service: MonitorService;
  let hooks: HookEmitter;
  let memory: MemoryService;
  let config: WorkhorseConfig;

  beforeEach(() => {
    vi.useFakeTimers();
    hooks = createMockHooks();
    memory = {} as MemoryService;
    config = { behavior: { pollInterval: 1000 } } as WorkhorseConfig;
    service = new MonitorService(hooks, memory, config);
  });

  afterEach(async () => {
    await service.shutdown();
    vi.useRealTimers();
  });

  describe("registerMonitor", () => {
    it("registers a polling monitor definition", () => {
      const handler = vi.fn();
      hooks.on("monitor.registered", handler);

      service.registerMonitor(createPollingMonitorOptions("test"));

      expect(handler).toHaveBeenCalledWith({ name: "test", type: "polling" });
    });

    it("registers an event monitor definition", () => {
      const handler = vi.fn();
      hooks.on("monitor.registered", handler);

      service.registerMonitor(createEventMonitorOptions("test-event"));

      expect(handler).toHaveBeenCalledWith({ name: "test-event", type: "event" });
    });

    it("throws if monitor id is already registered", () => {
      service.registerMonitor(createPollingMonitorOptions("test"));

      expect(() => service.registerMonitor(createPollingMonitorOptions("test"))).toThrow(
        'Monitor "test" is already registered',
      );
    });

    it("allows registering multiple monitors with different ids", async () => {
      service.registerMonitor(createPollingMonitorOptions("monitor-a"));
      service.registerMonitor(createPollingMonitorOptions("monitor-b"));

      // Both should be startable without error
      await service.startMonitor("monitor-a", "AM-123");
      await service.startMonitor("monitor-b", "AM-123");

      expect(service.getRunningMonitors("AM-123")).toHaveLength(2);
    });
  });

  describe("startMonitor", () => {
    it("starts a registered polling monitor for an issue", async () => {
      service.registerMonitor(createPollingMonitorOptions("test"));
      await service.startMonitor("test", "AM-123");

      const running = service.getRunningMonitors("AM-123");
      expect(running).toHaveLength(1);
      expect(running[0]!.id).toBe("test");
      expect(running[0]!.type).toBe("polling");
    });

    it("starts a registered event monitor for an issue", async () => {
      service.registerMonitor(createEventMonitorOptions("test-event"));
      await service.startMonitor("test-event", "AM-123");

      const running = service.getRunningMonitors("AM-123");
      expect(running).toHaveLength(1);
      expect(running[0]!.id).toBe("test-event");
      expect(running[0]!.type).toBe("event");
    });

    it("throws if monitor id is not registered", async () => {
      await expect(service.startMonitor("unknown", "AM-123")).rejects.toThrow(
        'Monitor "unknown" is not registered. Call registerMonitor() first.',
      );
    });

    it("is a no-op if the same monitor is already running for that issue", async () => {
      service.registerMonitor(createPollingMonitorOptions("test"));
      await service.startMonitor("test", "AM-123");
      await service.startMonitor("test", "AM-123");

      expect(service.getRunningMonitors("AM-123")).toHaveLength(1);
    });

    it("starts separate monitor instances for different issues", async () => {
      service.registerMonitor(createPollingMonitorOptions("test"));
      await service.startMonitor("test", "AM-123");
      await service.startMonitor("test", "AM-456");

      expect(service.getRunningMonitors("AM-123")).toHaveLength(1);
      expect(service.getRunningMonitors("AM-456")).toHaveLength(1);
    });

    it("can start multiple different monitors for the same issue", async () => {
      service.registerMonitor(createPollingMonitorOptions("monitor-a"));
      service.registerMonitor(createPollingMonitorOptions("monitor-b"));

      await service.startMonitor("monitor-a", "AM-123");
      await service.startMonitor("monitor-b", "AM-123");

      const running = service.getRunningMonitors("AM-123");
      expect(running).toHaveLength(2);
      expect(running.map((r) => r.id).sort()).toEqual(["monitor-a", "monitor-b"]);
    });
  });

  describe("poll loop", () => {
    it("calls poll() at configured interval", async () => {
      const pollFn = vi.fn().mockResolvedValue({ hasChanges: false });
      service.registerMonitor(createPollingMonitorOptions("test", { interval: 100, pollFn }));
      await service.startMonitor("test", "AM-123");

      expect(pollFn).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(100);
      expect(pollFn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(100);
      expect(pollFn).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(100);
      expect(pollFn).toHaveBeenCalledTimes(3);
    });

    it("passes MonitorContext to poll()", async () => {
      const pollFn = vi.fn().mockResolvedValue({ hasChanges: false });
      service.registerMonitor(createPollingMonitorOptions("test", { interval: 100, pollFn }));
      await service.startMonitor("test", "AM-123");

      await vi.advanceTimersByTimeAsync(100);

      expect(pollFn).toHaveBeenCalledWith({
        issueId: "AM-123",
        hooks,
        memory,
        config,
      });
    });

    it("emits monitor.tick when hasChanges is true", async () => {
      const handler = vi.fn();
      hooks.on("monitor.tick", handler);

      service.registerMonitor(
        createPollingMonitorOptions("test", {
          interval: 100,
          pollResult: { hasChanges: true, data: { comments: ["new"] } },
        }),
      );
      await service.startMonitor("test", "AM-123");

      await vi.advanceTimersByTimeAsync(100);

      expect(handler).toHaveBeenCalledWith({
        id: "test",
        issueId: "AM-123",
        result: { comments: ["new"] },
      });
    });

    it("does not emit monitor.tick when hasChanges is false", async () => {
      const handler = vi.fn();
      hooks.on("monitor.tick", handler);

      service.registerMonitor(
        createPollingMonitorOptions("test", {
          interval: 100,
          pollResult: { hasChanges: false },
        }),
      );
      await service.startMonitor("test", "AM-123");

      await vi.advanceTimersByTimeAsync(100);

      expect(handler).not.toHaveBeenCalled();
    });

    it("updates lastActivity after each poll", async () => {
      service.registerMonitor(
        createPollingMonitorOptions("test", {
          interval: 100,
          pollResult: { hasChanges: false },
        }),
      );
      await service.startMonitor("test", "AM-123");

      expect(service.getRunningMonitors("AM-123")[0]!.lastActivity).toBeUndefined();

      await vi.advanceTimersByTimeAsync(100);

      expect(service.getRunningMonitors("AM-123")[0]!.lastActivity).toBeInstanceOf(Date);
    });

    it("updates lastResult after each poll", async () => {
      const result = { hasChanges: true, data: { foo: "bar" } };
      service.registerMonitor(
        createPollingMonitorOptions("test", { interval: 100, pollResult: result }),
      );
      await service.startMonitor("test", "AM-123");

      await vi.advanceTimersByTimeAsync(100);

      expect(service.getRunningMonitors("AM-123")[0]!.lastResult).toEqual(result);
    });
  });

  describe("event monitor", () => {
    it("calls setup() when started", async () => {
      const setupFn = vi.fn().mockResolvedValue(() => {});
      service.registerMonitor(createEventMonitorOptions("test-event", { setupFn }));
      await service.startMonitor("test-event", "AM-123");

      expect(setupFn).toHaveBeenCalledTimes(1);
      expect(setupFn.mock.calls[0]![0]).toMatchObject({ issueId: "AM-123" });
    });

    it("emits monitor.tick when emit() is called with hasChanges: true", async () => {
      const handler = vi.fn();
      hooks.on("monitor.tick", handler);

      let emitFn: ((result: MonitorResult) => void) | null = null;
      const setupFn = vi.fn().mockImplementation(async (_ctx, emit) => {
        emitFn = emit;
        return () => {};
      });

      service.registerMonitor(createEventMonitorOptions("test-event", { setupFn }));
      await service.startMonitor("test-event", "AM-123");

      // Emit an event
      emitFn!({ hasChanges: true, data: { message: "hello" } });

      expect(handler).toHaveBeenCalledWith({
        id: "test-event",
        issueId: "AM-123",
        result: { message: "hello" },
      });
    });

    it("does not emit monitor.tick when emit() is called with hasChanges: false", async () => {
      const handler = vi.fn();
      hooks.on("monitor.tick", handler);

      let emitFn: ((result: MonitorResult) => void) | null = null;
      const setupFn = vi.fn().mockImplementation(async (_ctx, emit) => {
        emitFn = emit;
        return () => {};
      });

      service.registerMonitor(createEventMonitorOptions("test-event", { setupFn }));
      await service.startMonitor("test-event", "AM-123");

      emitFn!({ hasChanges: false });

      expect(handler).not.toHaveBeenCalled();
    });

    it("calls cleanup function when stopped", async () => {
      const cleanupFn = vi.fn();
      const setupFn = vi.fn().mockResolvedValue(cleanupFn);

      service.registerMonitor(createEventMonitorOptions("test-event", { setupFn }));
      await service.startMonitor("test-event", "AM-123");

      await service.stopMonitor("AM-123", "test-event");

      expect(cleanupFn).toHaveBeenCalledTimes(1);
    });

    it("updates lastActivity when emit() is called", async () => {
      let emitFn: ((result: MonitorResult) => void) | null = null;
      const setupFn = vi.fn().mockImplementation(async (_ctx, emit) => {
        emitFn = emit;
        return () => {};
      });

      service.registerMonitor(createEventMonitorOptions("test-event", { setupFn }));
      await service.startMonitor("test-event", "AM-123");

      expect(service.getRunningMonitors("AM-123")[0]!.lastActivity).toBeUndefined();

      emitFn!({ hasChanges: true, data: {} });

      expect(service.getRunningMonitors("AM-123")[0]!.lastActivity).toBeInstanceOf(Date);
    });
  });

  describe("getRunningMonitors", () => {
    it("returns statuses for all monitors of an issue", async () => {
      service.registerMonitor(createPollingMonitorOptions("monitor-a"));
      service.registerMonitor(createEventMonitorOptions("monitor-b"));

      await service.startMonitor("monitor-a", "AM-123");
      await service.startMonitor("monitor-b", "AM-123");

      const statuses = service.getRunningMonitors("AM-123");

      expect(statuses).toHaveLength(2);
      expect(statuses.every((s) => s.issueId === "AM-123")).toBe(true);
      expect(statuses.every((s) => s.state === "running")).toBe(true);
    });

    it("returns empty array for unknown issue", () => {
      expect(service.getRunningMonitors("unknown")).toEqual([]);
    });

    it("returns the live status object (callers should not mutate)", async () => {
      service.registerMonitor(createPollingMonitorOptions("test"));
      await service.startMonitor("test", "AM-123");

      const statuses = service.getRunningMonitors("AM-123");
      // Status is the live object — callers should treat it as read-only
      expect(statuses[0]).toBe(service.getRunningMonitors("AM-123")[0]);
    });
  });
});
