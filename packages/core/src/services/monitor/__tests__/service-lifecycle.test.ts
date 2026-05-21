import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkhorseConfig } from "#config";
import type { HookEmitter } from "#lib";
import type { MemoryService } from "#services";
import { createMockHooks } from "#test-helpers";

import { MonitorService } from "../service.ts";
import { createEventMonitorOptions, createPollingMonitorOptions } from "./service.test.ts";

describe("MonitorService - lifecycle and error handling", () => {
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

  describe("error handling", () => {
    it("increments errorCount on poll failure", async () => {
      const pollFn = vi.fn().mockRejectedValue(new Error("Poll failed"));
      service.registerMonitor(createPollingMonitorOptions("test", { interval: 100, pollFn }));
      await service.startMonitor("test", "AM-123");

      await vi.advanceTimersByTimeAsync(100);

      expect(service.getRunningMonitors("AM-123")[0]!.errorCount).toBe(1);
    });

    it("emits monitor.error when poll fails", async () => {
      const handler = vi.fn();
      hooks.on("monitor.error", handler);

      const error = new Error("Something went wrong");
      const pollFn = vi.fn().mockRejectedValue(error);
      service.registerMonitor(createPollingMonitorOptions("test", { interval: 100, pollFn }));
      await service.startMonitor("test", "AM-123");

      await vi.advanceTimersByTimeAsync(100);

      expect(handler).toHaveBeenCalledWith({
        id: "test",
        issueId: "AM-123",
        error,
        errorCount: 1,
      });
    });

    it("stops monitor after ERROR_THRESHOLD (5) consecutive errors", async () => {
      const pollFn = vi.fn().mockRejectedValue(new Error("Persistent failure"));
      service.registerMonitor(createPollingMonitorOptions("test", { interval: 100, pollFn }));
      await service.startMonitor("test", "AM-123");

      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      expect(service.getRunningMonitors("AM-123")).toHaveLength(0);
    });

    it("resets errorCount on successful poll", async () => {
      let callCount = 0;
      const pollFn = vi.fn().mockImplementation(async () => {
        if (++callCount < 3) throw new Error("Temporary failure");
        return { hasChanges: false };
      });

      service.registerMonitor(createPollingMonitorOptions("test", { interval: 100, pollFn }));
      await service.startMonitor("test", "AM-123");

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);
      expect(service.getRunningMonitors("AM-123")[0]!.errorCount).toBe(2);

      await vi.advanceTimersByTimeAsync(100);
      expect(service.getRunningMonitors("AM-123")[0]!.errorCount).toBe(0);
    });

    it("sets state to error when threshold reached", async () => {
      const errorHandler = vi.fn();
      hooks.on("monitor.error", errorHandler);

      const pollFn = vi.fn().mockRejectedValue(new Error("Failure"));
      service.registerMonitor(createPollingMonitorOptions("test", { interval: 100, pollFn }));
      await service.startMonitor("test", "AM-123");

      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      const lastCall = errorHandler.mock.calls[4]![0] as { errorCount: number };
      expect(lastCall.errorCount).toBe(5);
    });

    it("emits monitor.error when event monitor setup fails", async () => {
      const handler = vi.fn();
      hooks.on("monitor.error", handler);

      const error = new Error("Setup failed");
      const setupFn = vi.fn().mockRejectedValue(error);

      service.registerMonitor(createEventMonitorOptions("test-event", { setupFn }));
      await service.startMonitor("test-event", "AM-123");

      expect(handler).toHaveBeenCalledWith({
        id: "test-event",
        issueId: "AM-123",
        error,
        errorCount: 1,
      });
    });
  });

  describe("stopMonitor", () => {
    it("stops a specific monitor by id", async () => {
      service.registerMonitor(createPollingMonitorOptions("monitor-a"));
      service.registerMonitor(createPollingMonitorOptions("monitor-b"));

      await service.startMonitor("monitor-a", "AM-123");
      await service.startMonitor("monitor-b", "AM-123");

      await service.stopMonitor("AM-123", "monitor-a");

      const running = service.getRunningMonitors("AM-123");
      expect(running).toHaveLength(1);
      expect(running[0]!.id).toBe("monitor-b");
    });

    it("clears the timeout", async () => {
      const pollFn = vi.fn().mockResolvedValue({ hasChanges: false });
      service.registerMonitor(createPollingMonitorOptions("test", { interval: 100, pollFn }));
      await service.startMonitor("test", "AM-123");

      await service.stopMonitor("AM-123", "test");

      await vi.advanceTimersByTimeAsync(200);
      expect(pollFn).not.toHaveBeenCalled();
    });

    it("does nothing for unknown monitor", async () => {
      service.registerMonitor(createPollingMonitorOptions("test"));
      await service.startMonitor("test", "AM-123");

      // Should not throw
      await service.stopMonitor("AM-123", "unknown");
      await service.stopMonitor("AM-999", "test");
    });
  });

  describe("stopMonitors", () => {
    it("stops all monitors for an issue", async () => {
      service.registerMonitor(createPollingMonitorOptions("monitor-a"));
      service.registerMonitor(createPollingMonitorOptions("monitor-b"));

      await service.startMonitor("monitor-a", "AM-123");
      await service.startMonitor("monitor-b", "AM-123");

      await service.stopMonitors("AM-123");

      expect(service.getRunningMonitors("AM-123")).toHaveLength(0);
    });

    it("does not affect other issues", async () => {
      service.registerMonitor(createPollingMonitorOptions("test"));
      await service.startMonitor("test", "AM-123");
      await service.startMonitor("test", "AM-456");

      await service.stopMonitors("AM-123");

      expect(service.getRunningMonitors("AM-123")).toHaveLength(0);
      expect(service.getRunningMonitors("AM-456")).toHaveLength(1);
    });

    it("stops both polling and event monitors", async () => {
      service.registerMonitor(createPollingMonitorOptions("polling-monitor"));
      service.registerMonitor(createEventMonitorOptions("event-monitor"));

      await service.startMonitor("polling-monitor", "AM-123");
      await service.startMonitor("event-monitor", "AM-123");

      expect(service.getRunningMonitors("AM-123")).toHaveLength(2);

      await service.stopMonitors("AM-123");

      expect(service.getRunningMonitors("AM-123")).toHaveLength(0);
    });
  });

  describe("shutdown", () => {
    it("stops all running monitors", async () => {
      const pollFn = vi.fn().mockResolvedValue({ hasChanges: false });
      service.registerMonitor(createPollingMonitorOptions("test", { interval: 100, pollFn }));
      await service.startMonitor("test", "AM-123");
      await service.startMonitor("test", "AM-456");

      await service.shutdown();

      await vi.advanceTimersByTimeAsync(200);
      expect(pollFn).not.toHaveBeenCalled();

      expect(service.getRunningMonitors("AM-123")).toHaveLength(0);
      expect(service.getRunningMonitors("AM-456")).toHaveLength(0);
    });
  });

  it.skip("TODO: monitor continues polling after stopping until next tick", () => {
    // Edge case: what if poll is in progress when stopMonitor is called?
    // Currently we just clear the timeout, but an in-flight poll will complete.
    // This test documents that we may want to add an AbortController later.
  });
});
