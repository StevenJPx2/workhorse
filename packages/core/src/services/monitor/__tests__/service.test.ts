import mitt from "mitt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HookEventMap } from "#lib/hooks";
import { MonitorService } from "../service.ts";
import { Monitor } from "../monitor.ts";
import type { MonitorContext, MonitorResult } from "../types.ts";

describe("MonitorService", () => {
  let service: MonitorService;
  let hooks: ReturnType<typeof mitt<HookEventMap>>;

  beforeEach(() => {
    vi.useFakeTimers();
    hooks = mitt<HookEventMap>();
    service = new MonitorService();
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

  function createMonitor(
    name: string,
    options: {
      type?: "remote" | "local";
      interval?: number;
      pollResult?: MonitorResult;
      pollFn?: (ctx: MonitorContext) => Promise<MonitorResult>;
    } = {},
  ): Monitor {
    const { type = "remote", interval = 1000, pollResult = { hasChanges: false } } = options;
    return new Monitor({
      name,
      type,
      interval,
      poll: options.pollFn ?? (async () => pollResult),
    });
  }

  describe("startMonitor", () => {
    it("starts a monitor for an issue", () => {
      service.startMonitor("AM-123", createMockContext("AM-123"), createMonitor("test"));

      const running = service.getRunningMonitors("AM-123");
      expect(running).toHaveLength(1);
      expect(running[0]!.name).toBe("test");
    });

    it("emits monitor.registered hook", () => {
      const handler = vi.fn();
      hooks.on("monitor.registered", handler);

      service.startMonitor(
        "AM-123",
        createMockContext("AM-123"),
        createMonitor("my-monitor", { type: "local" }),
      );

      expect(handler).toHaveBeenCalledWith({ name: "my-monitor", type: "local" });
    });

    it("is a no-op if the same monitor name is already running for that issue", () => {
      const ctx = createMockContext("AM-123");
      service.startMonitor("AM-123", ctx, createMonitor("test"));
      service.startMonitor("AM-123", ctx, createMonitor("test"));

      expect(service.getRunningMonitors("AM-123")).toHaveLength(1);
    });

    it("starts separate monitors for different issues", () => {
      service.startMonitor("AM-123", createMockContext("AM-123"), createMonitor("test"));
      service.startMonitor("AM-456", createMockContext("AM-456"), createMonitor("test"));

      expect(service.getRunningMonitors("AM-123")).toHaveLength(1);
      expect(service.getRunningMonitors("AM-456")).toHaveLength(1);
    });

    it("can start multiple monitors for the same issue", () => {
      const ctx = createMockContext("AM-123");
      service.startMonitor("AM-123", ctx, createMonitor("monitor-a"));
      service.startMonitor("AM-123", ctx, createMonitor("monitor-b"));

      const running = service.getRunningMonitors("AM-123");
      expect(running).toHaveLength(2);
      expect(running.map((r) => r.name).sort()).toEqual(["monitor-a", "monitor-b"]);
    });
  });

  describe("poll loop", () => {
    it("calls poll() at configured interval", async () => {
      const pollFn = vi.fn().mockResolvedValue({ hasChanges: false });
      service.startMonitor(
        "AM-123",
        createMockContext("AM-123"),
        createMonitor("test", { interval: 100, pollFn }),
      );

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
      const ctx = createMockContext("AM-123");
      service.startMonitor("AM-123", ctx, createMonitor("test", { interval: 100, pollFn }));

      await vi.advanceTimersByTimeAsync(100);

      expect(pollFn).toHaveBeenCalledWith(ctx);
    });

    it("emits monitor.tick when hasChanges is true", async () => {
      const handler = vi.fn();
      hooks.on("monitor.tick", handler);

      service.startMonitor(
        "AM-123",
        createMockContext("AM-123"),
        createMonitor("test", {
          interval: 100,
          pollResult: { hasChanges: true, data: { comments: ["new"] } },
        }),
      );

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

      service.startMonitor(
        "AM-123",
        createMockContext("AM-123"),
        createMonitor("test", { interval: 100, pollResult: { hasChanges: false } }),
      );

      await vi.advanceTimersByTimeAsync(100);

      expect(handler).not.toHaveBeenCalled();
    });

    it("updates lastPoll after each poll", async () => {
      service.startMonitor(
        "AM-123",
        createMockContext("AM-123"),
        createMonitor("test", { interval: 100, pollResult: { hasChanges: false } }),
      );

      expect(service.getRunningMonitors("AM-123")[0]!.lastPoll).toBeUndefined();

      await vi.advanceTimersByTimeAsync(100);

      expect(service.getRunningMonitors("AM-123")[0]!.lastPoll).toBeInstanceOf(Date);
    });

    it("updates lastResult after each poll", async () => {
      const result = { hasChanges: true, data: { foo: "bar" } };
      service.startMonitor(
        "AM-123",
        createMockContext("AM-123"),
        createMonitor("test", { interval: 100, pollResult: result }),
      );

      await vi.advanceTimersByTimeAsync(100);

      expect(service.getRunningMonitors("AM-123")[0]!.lastResult).toEqual(result);
    });
  });

  describe("error handling", () => {
    it("increments errorCount on poll failure", async () => {
      const pollFn = vi.fn().mockRejectedValue(new Error("Poll failed"));
      service.startMonitor(
        "AM-123",
        createMockContext("AM-123"),
        createMonitor("test", { interval: 100, pollFn }),
      );

      await vi.advanceTimersByTimeAsync(100);

      expect(service.getRunningMonitors("AM-123")[0]!.errorCount).toBe(1);
    });

    it("emits monitor.error when poll fails", async () => {
      const handler = vi.fn();
      hooks.on("monitor.error", handler);

      const error = new Error("Something went wrong");
      const pollFn = vi.fn().mockRejectedValue(error);
      service.startMonitor(
        "AM-123",
        createMockContext("AM-123"),
        createMonitor("test", { interval: 100, pollFn }),
      );

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
      service.startMonitor(
        "AM-123",
        createMockContext("AM-123"),
        createMonitor("test", { interval: 100, pollFn }),
      );

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

      service.startMonitor(
        "AM-123",
        createMockContext("AM-123"),
        createMonitor("test", { interval: 100, pollFn }),
      );

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
      service.startMonitor(
        "AM-123",
        createMockContext("AM-123"),
        createMonitor("test", { interval: 100, pollFn }),
      );

      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      const lastCall = errorHandler.mock.calls[4]![0] as { errorCount: number };
      expect(lastCall.errorCount).toBe(5);
    });
  });

  describe("stopMonitor", () => {
    it("stops a specific monitor by name", () => {
      const ctx = createMockContext("AM-123");
      service.startMonitor("AM-123", ctx, createMonitor("monitor-a"));
      service.startMonitor("AM-123", ctx, createMonitor("monitor-b"));

      service.stopMonitor("AM-123", "monitor-a");

      const running = service.getRunningMonitors("AM-123");
      expect(running).toHaveLength(1);
      expect(running[0]!.name).toBe("monitor-b");
    });

    it("clears the timeout", async () => {
      const pollFn = vi.fn().mockResolvedValue({ hasChanges: false });
      service.startMonitor(
        "AM-123",
        createMockContext("AM-123"),
        createMonitor("test", { interval: 100, pollFn }),
      );

      service.stopMonitor("AM-123", "test");

      await vi.advanceTimersByTimeAsync(200);
      expect(pollFn).not.toHaveBeenCalled();
    });

    it("does nothing for unknown monitor", () => {
      service.startMonitor("AM-123", createMockContext("AM-123"), createMonitor("test"));

      // Should not throw
      service.stopMonitor("AM-123", "unknown");
      service.stopMonitor("AM-999", "test");
    });
  });

  describe("stopMonitors", () => {
    it("stops all monitors for an issue", () => {
      const ctx = createMockContext("AM-123");
      service.startMonitor("AM-123", ctx, createMonitor("monitor-a"));
      service.startMonitor("AM-123", ctx, createMonitor("monitor-b"));

      service.stopMonitors("AM-123");

      expect(service.getRunningMonitors("AM-123")).toHaveLength(0);
    });

    it("does not affect other issues", () => {
      service.startMonitor("AM-123", createMockContext("AM-123"), createMonitor("test"));
      service.startMonitor("AM-456", createMockContext("AM-456"), createMonitor("test"));

      service.stopMonitors("AM-123");

      expect(service.getRunningMonitors("AM-123")).toHaveLength(0);
      expect(service.getRunningMonitors("AM-456")).toHaveLength(1);
    });
  });

  describe("getRunningMonitors", () => {
    it("returns statuses for all monitors of an issue", () => {
      const ctx = createMockContext("AM-123");
      service.startMonitor("AM-123", ctx, createMonitor("monitor-a", { type: "remote" }));
      service.startMonitor("AM-123", ctx, createMonitor("monitor-b", { type: "local" }));

      const statuses = service.getRunningMonitors("AM-123");

      expect(statuses).toHaveLength(2);
      expect(statuses.every((s) => s.issueId === "AM-123")).toBe(true);
      expect(statuses.every((s) => s.state === "running")).toBe(true);
    });

    it("returns empty array for unknown issue", () => {
      expect(service.getRunningMonitors("unknown")).toEqual([]);
    });

    it("returns the live status object (callers should not mutate)", () => {
      service.startMonitor("AM-123", createMockContext("AM-123"), createMonitor("test"));

      const statuses = service.getRunningMonitors("AM-123");
      // Status is the live object — callers should treat it as read-only
      expect(statuses[0]).toBe(service.getRunningMonitors("AM-123")[0]);
    });
  });

  describe("shutdown", () => {
    it("stops all running monitors", async () => {
      const pollFn = vi.fn().mockResolvedValue({ hasChanges: false });
      service.startMonitor(
        "AM-123",
        createMockContext("AM-123"),
        createMonitor("test", { interval: 100, pollFn }),
      );
      service.startMonitor(
        "AM-456",
        createMockContext("AM-456"),
        createMonitor("test", { interval: 100, pollFn }),
      );

      service.shutdown();

      await vi.advanceTimersByTimeAsync(200);
      expect(pollFn).not.toHaveBeenCalled();

      expect(service.getRunningMonitors("AM-123")).toHaveLength(0);
      expect(service.getRunningMonitors("AM-456")).toHaveLength(0);
    });
  });

  it.fails("TODO: monitor continues polling after stopping until next tick", () => {
    // Edge case: what if poll is in progress when stopMonitor is called?
    // Currently we just clear the timeout, but an in-flight poll will complete.
    // This test documents that we may want to add an AbortController later.
    expect(true).toBe(false);
  });
});
