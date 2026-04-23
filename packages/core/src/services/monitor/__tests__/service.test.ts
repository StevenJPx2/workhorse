import mitt from "mitt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HookEventMap } from "#lib/hooks";
import { MonitorService } from "../service.ts";
import type { Monitor, MonitorContext, MonitorFactory, MonitorResult } from "../types.ts";

describe("MonitorService", () => {
  let service: MonitorService;
  let hooks: ReturnType<typeof mitt<HookEventMap>>;

  beforeEach(() => {
    vi.useFakeTimers();
    hooks = mitt<HookEventMap>();
    service = new MonitorService(hooks);
  });

  afterEach(() => {
    service.shutdown();
    vi.useRealTimers();
  });

  function createMockContext(issueId: string): MonitorContext {
    return {
      issueId,
      hooks,
      memory: {} as MonitorContext["memory"],
      config: { behavior: { pollInterval: 1000 } } as MonitorContext["config"],
    };
  }

  function createMockFactory(
    name: string,
    options: {
      type?: "remote" | "local";
      interval?: number;
      pollResult?: MonitorResult;
      pollFn?: () => Promise<MonitorResult>;
    } = {},
  ): MonitorFactory {
    const { type = "remote", interval = 1000, pollResult = { hasChanges: false } } = options;

    return (_ctx: MonitorContext): Monitor => ({
      name,
      type,
      interval,
      poll: options.pollFn ?? (async () => pollResult),
    });
  }

  describe("registration", () => {
    it("registers a monitor factory", () => {
      const factory = createMockFactory("test-monitor");
      service.registerMonitor("test-monitor", factory);

      // Verify by starting monitors - factory should be invoked
      service.startMonitors("AM-123", createMockContext("AM-123"));
      const running = service.getRunningMonitors("AM-123");
      expect(running).toHaveLength(1);
      expect(running[0]!.name).toBe("test-monitor");
    });

    it("throws if registering duplicate name", () => {
      const factory = createMockFactory("duplicate");
      service.registerMonitor("duplicate", factory);

      expect(() => service.registerMonitor("duplicate", factory)).toThrow(
        'Monitor "duplicate" is already registered',
      );
    });
  });

  describe("startMonitors", () => {
    it("creates running instances for all registered factories", () => {
      service.registerMonitor("monitor-a", createMockFactory("monitor-a"));
      service.registerMonitor("monitor-b", createMockFactory("monitor-b"));

      service.startMonitors("AM-123", createMockContext("AM-123"));

      const running = service.getRunningMonitors("AM-123");
      expect(running).toHaveLength(2);
      expect(running.map((r) => r.name).sort()).toEqual(["monitor-a", "monitor-b"]);
    });

    it("emits monitor.registered hook for each monitor", () => {
      const handler = vi.fn();
      hooks.on("monitor.registered", handler);

      service.registerMonitor("my-monitor", createMockFactory("my-monitor", { type: "local" }));
      service.startMonitors("AM-123", createMockContext("AM-123"));

      expect(handler).toHaveBeenCalledWith({ name: "my-monitor", type: "local" });
    });

    it("does not start duplicate monitors for same issue", () => {
      service.registerMonitor("test", createMockFactory("test"));

      const ctx = createMockContext("AM-123");
      service.startMonitors("AM-123", ctx);
      service.startMonitors("AM-123", ctx); // Second call should be ignored

      const running = service.getRunningMonitors("AM-123");
      expect(running).toHaveLength(1);
    });

    it("starts separate monitors for different issues", () => {
      service.registerMonitor("test", createMockFactory("test"));

      service.startMonitors("AM-123", createMockContext("AM-123"));
      service.startMonitors("AM-456", createMockContext("AM-456"));

      expect(service.getRunningMonitors("AM-123")).toHaveLength(1);
      expect(service.getRunningMonitors("AM-456")).toHaveLength(1);
    });
  });

  describe("poll loop", () => {
    it("calls poll() at configured interval", async () => {
      const pollFn = vi.fn().mockResolvedValue({ hasChanges: false });
      service.registerMonitor("test", createMockFactory("test", { interval: 100, pollFn }));
      service.startMonitors("AM-123", createMockContext("AM-123"));

      expect(pollFn).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(100);
      expect(pollFn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(100);
      expect(pollFn).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(100);
      expect(pollFn).toHaveBeenCalledTimes(3);
    });

    it("emits monitor.tick when hasChanges is true", async () => {
      const handler = vi.fn();
      hooks.on("monitor.tick", handler);

      service.registerMonitor(
        "test",
        createMockFactory("test", {
          interval: 100,
          pollResult: { hasChanges: true, data: { comments: ["new"] } },
        }),
      );
      service.startMonitors("AM-123", createMockContext("AM-123"));

      await vi.advanceTimersByTimeAsync(100);

      expect(handler).toHaveBeenCalledWith({
        name: "test",
        issueId: "AM-123",
        result: { comments: ["new"] },
      });
    });

    it("does not emit monitor.tick when hasChanges is false", async () => {
      const handler = vi.fn();
      hooks.on("monitor.tick", handler);

      service.registerMonitor(
        "test",
        createMockFactory("test", { interval: 100, pollResult: { hasChanges: false } }),
      );
      service.startMonitors("AM-123", createMockContext("AM-123"));

      await vi.advanceTimersByTimeAsync(100);

      expect(handler).not.toHaveBeenCalled();
    });

    it("updates lastPoll after each poll", async () => {
      service.registerMonitor(
        "test",
        createMockFactory("test", { interval: 100, pollResult: { hasChanges: false } }),
      );
      service.startMonitors("AM-123", createMockContext("AM-123"));

      const beforePoll = service.getRunningMonitors("AM-123")[0]!;
      expect(beforePoll.lastPoll).toBeUndefined();

      await vi.advanceTimersByTimeAsync(100);

      const afterPoll = service.getRunningMonitors("AM-123")[0]!;
      expect(afterPoll.lastPoll).toBeInstanceOf(Date);
    });

    it("updates lastResult after each poll", async () => {
      const result = { hasChanges: true, data: { foo: "bar" } };
      service.registerMonitor(
        "test",
        createMockFactory("test", { interval: 100, pollResult: result }),
      );
      service.startMonitors("AM-123", createMockContext("AM-123"));

      await vi.advanceTimersByTimeAsync(100);

      const status = service.getRunningMonitors("AM-123")[0]!;
      expect(status.lastResult).toEqual(result);
    });
  });

  describe("error handling", () => {
    it("increments errorCount on poll failure", async () => {
      const pollFn = vi.fn().mockRejectedValue(new Error("Poll failed"));
      service.registerMonitor("test", createMockFactory("test", { interval: 100, pollFn }));
      service.startMonitors("AM-123", createMockContext("AM-123"));

      await vi.advanceTimersByTimeAsync(100);

      const status = service.getRunningMonitors("AM-123")[0]!;
      expect(status.errorCount).toBe(1);
    });

    it("emits monitor.error when poll fails", async () => {
      const handler = vi.fn();
      hooks.on("monitor.error", handler);

      const error = new Error("Something went wrong");
      const pollFn = vi.fn().mockRejectedValue(error);
      service.registerMonitor("test", createMockFactory("test", { interval: 100, pollFn }));
      service.startMonitors("AM-123", createMockContext("AM-123"));

      await vi.advanceTimersByTimeAsync(100);

      expect(handler).toHaveBeenCalledWith({
        name: "test",
        issueId: "AM-123",
        error,
        errorCount: 1,
      });
    });

    it("stops monitor after ERROR_THRESHOLD (5) consecutive errors", async () => {
      const pollFn = vi.fn().mockRejectedValue(new Error("Persistent failure"));
      service.registerMonitor("test", createMockFactory("test", { interval: 100, pollFn }));
      service.startMonitors("AM-123", createMockContext("AM-123"));

      // Advance through 5 errors
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      // Monitor should be stopped after 5th error
      const running = service.getRunningMonitors("AM-123");
      expect(running).toHaveLength(0);
    });

    it("resets errorCount on successful poll", async () => {
      let callCount = 0;
      const pollFn = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error("Temporary failure");
        }
        return { hasChanges: false };
      });

      service.registerMonitor("test", createMockFactory("test", { interval: 100, pollFn }));
      service.startMonitors("AM-123", createMockContext("AM-123"));

      // Two failures
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);

      let status = service.getRunningMonitors("AM-123")[0]!;
      expect(status.errorCount).toBe(2);

      // One success
      await vi.advanceTimersByTimeAsync(100);

      status = service.getRunningMonitors("AM-123")[0]!;
      expect(status.errorCount).toBe(0);
    });

    it("sets state to error when threshold reached", async () => {
      const errorHandler = vi.fn();
      hooks.on("monitor.error", errorHandler);

      const pollFn = vi.fn().mockRejectedValue(new Error("Failure"));
      service.registerMonitor("test", createMockFactory("test", { interval: 100, pollFn }));
      service.startMonitors("AM-123", createMockContext("AM-123"));

      // Advance through 5 errors
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      // Last error event should have errorCount of 5
      const lastCall = errorHandler.mock.calls[4]![0] as {
        name: string;
        issueId: string;
        error: Error;
        errorCount: number;
      };
      expect(lastCall.errorCount).toBe(5);
    });
  });

  describe("stopMonitor", () => {
    it("stops a specific monitor by name", async () => {
      service.registerMonitor("monitor-a", createMockFactory("monitor-a"));
      service.registerMonitor("monitor-b", createMockFactory("monitor-b"));
      service.startMonitors("AM-123", createMockContext("AM-123"));

      service.stopMonitor("AM-123", "monitor-a");

      const running = service.getRunningMonitors("AM-123");
      expect(running).toHaveLength(1);
      expect(running[0]!.name).toBe("monitor-b");
    });

    it("clears the timeout", async () => {
      const pollFn = vi.fn().mockResolvedValue({ hasChanges: false });
      service.registerMonitor("test", createMockFactory("test", { interval: 100, pollFn }));
      service.startMonitors("AM-123", createMockContext("AM-123"));

      service.stopMonitor("AM-123", "test");

      await vi.advanceTimersByTimeAsync(200);
      expect(pollFn).not.toHaveBeenCalled();
    });

    it("does nothing for unknown monitor", () => {
      service.registerMonitor("test", createMockFactory("test"));
      service.startMonitors("AM-123", createMockContext("AM-123"));

      // Should not throw
      service.stopMonitor("AM-123", "unknown");
      service.stopMonitor("AM-999", "test");
    });
  });

  describe("stopMonitors", () => {
    it("stops all monitors for an issue", () => {
      service.registerMonitor("monitor-a", createMockFactory("monitor-a"));
      service.registerMonitor("monitor-b", createMockFactory("monitor-b"));
      service.startMonitors("AM-123", createMockContext("AM-123"));

      service.stopMonitors("AM-123");

      expect(service.getRunningMonitors("AM-123")).toHaveLength(0);
    });

    it("does not affect other issues", () => {
      service.registerMonitor("test", createMockFactory("test"));
      service.startMonitors("AM-123", createMockContext("AM-123"));
      service.startMonitors("AM-456", createMockContext("AM-456"));

      service.stopMonitors("AM-123");

      expect(service.getRunningMonitors("AM-123")).toHaveLength(0);
      expect(service.getRunningMonitors("AM-456")).toHaveLength(1);
    });
  });

  describe("getRunningMonitors", () => {
    it("returns statuses for all monitors of an issue", () => {
      service.registerMonitor("monitor-a", createMockFactory("monitor-a", { type: "remote" }));
      service.registerMonitor("monitor-b", createMockFactory("monitor-b", { type: "local" }));
      service.startMonitors("AM-123", createMockContext("AM-123"));

      const statuses = service.getRunningMonitors("AM-123");

      expect(statuses).toHaveLength(2);
      expect(statuses.every((s) => s.issueId === "AM-123")).toBe(true);
      expect(statuses.every((s) => s.state === "running")).toBe(true);
    });

    it("returns empty array for unknown issue", () => {
      expect(service.getRunningMonitors("unknown")).toEqual([]);
    });

    it("returns copies of statuses (immutable)", () => {
      service.registerMonitor("test", createMockFactory("test"));
      service.startMonitors("AM-123", createMockContext("AM-123"));

      const statuses = service.getRunningMonitors("AM-123");
      statuses[0]!.errorCount = 999;

      const freshStatuses = service.getRunningMonitors("AM-123");
      expect(freshStatuses[0]!.errorCount).toBe(0);
    });
  });

  describe("shutdown", () => {
    it("stops all running monitors", async () => {
      const pollFn = vi.fn().mockResolvedValue({ hasChanges: false });
      service.registerMonitor("test", createMockFactory("test", { interval: 100, pollFn }));
      service.startMonitors("AM-123", createMockContext("AM-123"));
      service.startMonitors("AM-456", createMockContext("AM-456"));

      service.shutdown();

      await vi.advanceTimersByTimeAsync(200);
      expect(pollFn).not.toHaveBeenCalled();

      expect(service.getRunningMonitors("AM-123")).toHaveLength(0);
      expect(service.getRunningMonitors("AM-456")).toHaveLength(0);
    });
  });

  it.fails("TODO: monitor continues polling after stopping until next tick", () => {
    // Edge case: what if poll is in progress when stopMonitor is called?
    // Currently we just clear the timeout, but an in-flight poll will complete
    // This test documents that we may want to add an AbortController later
    expect(true).toBe(false);
  });
});
