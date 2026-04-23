import mitt from "mitt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JiratownConfig } from "#config";
import type { HookEventMap } from "#lib/hooks";
import type { MemoryService } from "#services/memory";
import { MonitorService } from "../service.ts";
import type { MonitorContext, MonitorOptions, MonitorResult } from "../types.ts";

describe("MonitorService", () => {
  let service: MonitorService;
  let hooks: ReturnType<typeof mitt<HookEventMap>>;
  let memory: MemoryService;
  let config: JiratownConfig;

  beforeEach(() => {
    vi.useFakeTimers();
    hooks = mitt<HookEventMap>();
    memory = {} as MemoryService;
    config = { behavior: { pollInterval: 1000 } } as JiratownConfig;
    service = new MonitorService(hooks, memory, config);
  });

  afterEach(() => {
    service.shutdown();
    vi.useRealTimers();
  });

  function createMonitorOptions(
    id: string,
    options: {
      type?: "remote" | "local";
      interval?: number;
      pollResult?: MonitorResult;
      pollFn?: (ctx: MonitorContext) => Promise<MonitorResult>;
    } = {},
  ): MonitorOptions {
    const { type = "remote", interval = 1000, pollResult = { hasChanges: false } } = options;
    return {
      id,
      type,
      interval,
      poll: options.pollFn ?? (async () => pollResult),
    };
  }

  describe("registerMonitor", () => {
    it("registers a monitor definition", () => {
      const handler = vi.fn();
      hooks.on("monitor.registered", handler);

      service.registerMonitor(createMonitorOptions("test"));

      expect(handler).toHaveBeenCalledWith({ name: "test", type: "remote" });
    });

    it("throws if monitor id is already registered", () => {
      service.registerMonitor(createMonitorOptions("test"));

      expect(() => service.registerMonitor(createMonitorOptions("test"))).toThrow(
        'Monitor "test" is already registered',
      );
    });

    it("allows registering multiple monitors with different ids", () => {
      service.registerMonitor(createMonitorOptions("monitor-a"));
      service.registerMonitor(createMonitorOptions("monitor-b"));

      // Both should be startable without error
      service.startMonitor("monitor-a", "AM-123");
      service.startMonitor("monitor-b", "AM-123");

      expect(service.getRunningMonitors("AM-123")).toHaveLength(2);
    });
  });

  describe("startMonitor", () => {
    it("starts a registered monitor for an issue", () => {
      service.registerMonitor(createMonitorOptions("test"));
      service.startMonitor("test", "AM-123");

      const running = service.getRunningMonitors("AM-123");
      expect(running).toHaveLength(1);
      expect(running[0]!.id).toBe("test");
    });

    it("throws if monitor id is not registered", () => {
      expect(() => service.startMonitor("unknown", "AM-123")).toThrow(
        'Monitor "unknown" is not registered. Call registerMonitor() first.',
      );
    });

    it("is a no-op if the same monitor is already running for that issue", () => {
      service.registerMonitor(createMonitorOptions("test"));
      service.startMonitor("test", "AM-123");
      service.startMonitor("test", "AM-123");

      expect(service.getRunningMonitors("AM-123")).toHaveLength(1);
    });

    it("starts separate monitor instances for different issues", () => {
      service.registerMonitor(createMonitorOptions("test"));
      service.startMonitor("test", "AM-123");
      service.startMonitor("test", "AM-456");

      expect(service.getRunningMonitors("AM-123")).toHaveLength(1);
      expect(service.getRunningMonitors("AM-456")).toHaveLength(1);
    });

    it("can start multiple different monitors for the same issue", () => {
      service.registerMonitor(createMonitorOptions("monitor-a"));
      service.registerMonitor(createMonitorOptions("monitor-b"));

      service.startMonitor("monitor-a", "AM-123");
      service.startMonitor("monitor-b", "AM-123");

      const running = service.getRunningMonitors("AM-123");
      expect(running).toHaveLength(2);
      expect(running.map((r) => r.id).sort()).toEqual(["monitor-a", "monitor-b"]);
    });
  });

  describe("poll loop", () => {
    it("calls poll() at configured interval", async () => {
      const pollFn = vi.fn().mockResolvedValue({ hasChanges: false });
      service.registerMonitor(createMonitorOptions("test", { interval: 100, pollFn }));
      service.startMonitor("test", "AM-123");

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
      service.registerMonitor(createMonitorOptions("test", { interval: 100, pollFn }));
      service.startMonitor("test", "AM-123");

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
        createMonitorOptions("test", {
          interval: 100,
          pollResult: { hasChanges: true, data: { comments: ["new"] } },
        }),
      );
      service.startMonitor("test", "AM-123");

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
        createMonitorOptions("test", { interval: 100, pollResult: { hasChanges: false } }),
      );
      service.startMonitor("test", "AM-123");

      await vi.advanceTimersByTimeAsync(100);

      expect(handler).not.toHaveBeenCalled();
    });

    it("updates lastPoll after each poll", async () => {
      service.registerMonitor(
        createMonitorOptions("test", { interval: 100, pollResult: { hasChanges: false } }),
      );
      service.startMonitor("test", "AM-123");

      expect(service.getRunningMonitors("AM-123")[0]!.lastPoll).toBeUndefined();

      await vi.advanceTimersByTimeAsync(100);

      expect(service.getRunningMonitors("AM-123")[0]!.lastPoll).toBeInstanceOf(Date);
    });

    it("updates lastResult after each poll", async () => {
      const result = { hasChanges: true, data: { foo: "bar" } };
      service.registerMonitor(createMonitorOptions("test", { interval: 100, pollResult: result }));
      service.startMonitor("test", "AM-123");

      await vi.advanceTimersByTimeAsync(100);

      expect(service.getRunningMonitors("AM-123")[0]!.lastResult).toEqual(result);
    });
  });

  describe("error handling", () => {
    it("increments errorCount on poll failure", async () => {
      const pollFn = vi.fn().mockRejectedValue(new Error("Poll failed"));
      service.registerMonitor(createMonitorOptions("test", { interval: 100, pollFn }));
      service.startMonitor("test", "AM-123");

      await vi.advanceTimersByTimeAsync(100);

      expect(service.getRunningMonitors("AM-123")[0]!.errorCount).toBe(1);
    });

    it("emits monitor.error when poll fails", async () => {
      const handler = vi.fn();
      hooks.on("monitor.error", handler);

      const error = new Error("Something went wrong");
      const pollFn = vi.fn().mockRejectedValue(error);
      service.registerMonitor(createMonitorOptions("test", { interval: 100, pollFn }));
      service.startMonitor("test", "AM-123");

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
      service.registerMonitor(createMonitorOptions("test", { interval: 100, pollFn }));
      service.startMonitor("test", "AM-123");

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

      service.registerMonitor(createMonitorOptions("test", { interval: 100, pollFn }));
      service.startMonitor("test", "AM-123");

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
      service.registerMonitor(createMonitorOptions("test", { interval: 100, pollFn }));
      service.startMonitor("test", "AM-123");

      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      const lastCall = errorHandler.mock.calls[4]![0] as { errorCount: number };
      expect(lastCall.errorCount).toBe(5);
    });
  });

  describe("stopMonitor", () => {
    it("stops a specific monitor by id", () => {
      service.registerMonitor(createMonitorOptions("monitor-a"));
      service.registerMonitor(createMonitorOptions("monitor-b"));

      service.startMonitor("monitor-a", "AM-123");
      service.startMonitor("monitor-b", "AM-123");

      service.stopMonitor("AM-123", "monitor-a");

      const running = service.getRunningMonitors("AM-123");
      expect(running).toHaveLength(1);
      expect(running[0]!.id).toBe("monitor-b");
    });

    it("clears the timeout", async () => {
      const pollFn = vi.fn().mockResolvedValue({ hasChanges: false });
      service.registerMonitor(createMonitorOptions("test", { interval: 100, pollFn }));
      service.startMonitor("test", "AM-123");

      service.stopMonitor("AM-123", "test");

      await vi.advanceTimersByTimeAsync(200);
      expect(pollFn).not.toHaveBeenCalled();
    });

    it("does nothing for unknown monitor", () => {
      service.registerMonitor(createMonitorOptions("test"));
      service.startMonitor("test", "AM-123");

      // Should not throw
      service.stopMonitor("AM-123", "unknown");
      service.stopMonitor("AM-999", "test");
    });
  });

  describe("stopMonitors", () => {
    it("stops all monitors for an issue", () => {
      service.registerMonitor(createMonitorOptions("monitor-a"));
      service.registerMonitor(createMonitorOptions("monitor-b"));

      service.startMonitor("monitor-a", "AM-123");
      service.startMonitor("monitor-b", "AM-123");

      service.stopMonitors("AM-123");

      expect(service.getRunningMonitors("AM-123")).toHaveLength(0);
    });

    it("does not affect other issues", () => {
      service.registerMonitor(createMonitorOptions("test"));
      service.startMonitor("test", "AM-123");
      service.startMonitor("test", "AM-456");

      service.stopMonitors("AM-123");

      expect(service.getRunningMonitors("AM-123")).toHaveLength(0);
      expect(service.getRunningMonitors("AM-456")).toHaveLength(1);
    });
  });

  describe("getRunningMonitors", () => {
    it("returns statuses for all monitors of an issue", () => {
      service.registerMonitor(createMonitorOptions("monitor-a", { type: "remote" }));
      service.registerMonitor(createMonitorOptions("monitor-b", { type: "local" }));

      service.startMonitor("monitor-a", "AM-123");
      service.startMonitor("monitor-b", "AM-123");

      const statuses = service.getRunningMonitors("AM-123");

      expect(statuses).toHaveLength(2);
      expect(statuses.every((s) => s.issueId === "AM-123")).toBe(true);
      expect(statuses.every((s) => s.state === "running")).toBe(true);
    });

    it("returns empty array for unknown issue", () => {
      expect(service.getRunningMonitors("unknown")).toEqual([]);
    });

    it("returns the live status object (callers should not mutate)", () => {
      service.registerMonitor(createMonitorOptions("test"));
      service.startMonitor("test", "AM-123");

      const statuses = service.getRunningMonitors("AM-123");
      // Status is the live object — callers should treat it as read-only
      expect(statuses[0]).toBe(service.getRunningMonitors("AM-123")[0]);
    });
  });

  describe("shutdown", () => {
    it("stops all running monitors", async () => {
      const pollFn = vi.fn().mockResolvedValue({ hasChanges: false });
      service.registerMonitor(createMonitorOptions("test", { interval: 100, pollFn }));
      service.startMonitor("test", "AM-123");
      service.startMonitor("test", "AM-456");

      service.shutdown();

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
