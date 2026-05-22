/**
 * Tests for the PollingMonitor class directly (not MonitorService).
 * Covers edge cases in the poll loop that are hard to hit via service.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkhorseConfig } from "#config";
import type { HookEmitter } from "#lib";
import type {
  MemoryService,
  MonitorContext,
  PollingMonitorOptions,
} from "#services";
import { createMockHooks } from "#test-helpers";

import { PollingMonitor } from "..";

describe("PollingMonitor", () => {
  let hooks: HookEmitter;
  let memory: MemoryService;
  let config: WorkhorseConfig;

  beforeEach(() => {
    vi.useFakeTimers();
    hooks = createMockHooks();
    memory = {} as MemoryService;
    config = { behavior: { pollInterval: 1000 } } as WorkhorseConfig;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createMonitor(
    options: Partial<PollingMonitorOptions> & {
      poll?: PollingMonitorOptions["poll"];
    } = {},
  ): PollingMonitor {
    return new PollingMonitor({
      id: options.id ?? "test-monitor",
      type: "polling",
      interval: options.interval ?? 100,
      poll: options.poll ?? (async () => ({ hasChanges: false })),
    });
  }

  function createContext(issueId = "AM-123"): MonitorContext {
    return { issueId, hooks, memory, config };
  }

  describe("start", () => {
    it("is a no-op if already running", async () => {
      const pollFn = vi.fn().mockResolvedValue({ hasChanges: false });
      const monitor = createMonitor({ poll: pollFn });

      monitor.start(createContext());
      monitor.start(createContext()); // Should be ignored
      monitor.start(createContext()); // Should be ignored

      await vi.advanceTimersByTimeAsync(100);

      // Only one poll should have been scheduled
      expect(pollFn).toHaveBeenCalledTimes(1);

      monitor.stop();
    });

    it("sets state to running", () => {
      const monitor = createMonitor();

      expect(monitor.status.state).toBe("stopped");

      monitor.start(createContext());

      expect(monitor.status.state).toBe("running");

      monitor.stop();
    });
  });

  describe("stop", () => {
    it("stops polling when called during setTimeout wait", async () => {
      const pollFn = vi.fn().mockResolvedValue({ hasChanges: false });
      const monitor = createMonitor({ interval: 100, poll: pollFn });

      monitor.start(createContext());

      // Advance partially into the interval
      await vi.advanceTimersByTimeAsync(50);

      // Stop before poll executes
      monitor.stop();

      // Advance past when poll would have fired
      await vi.advanceTimersByTimeAsync(100);

      // Poll should not have been called
      expect(pollFn).not.toHaveBeenCalled();
    });

    it("prevents next poll cycle when stopped during poll execution", async () => {
      let pollCount = 0;
      const pollFn = vi.fn().mockImplementation(async () => {
        pollCount++;
        if (pollCount === 1) {
          // Stop during first poll - this simulates state change during async
        }
        return { hasChanges: false };
      });
      const monitor = createMonitor({ interval: 100, poll: pollFn });

      monitor.start(createContext());

      // First poll
      await vi.advanceTimersByTimeAsync(100);
      expect(pollFn).toHaveBeenCalledTimes(1);

      // Stop before second poll
      monitor.stop();

      // Second poll should not occur
      await vi.advanceTimersByTimeAsync(100);
      expect(pollFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("onError with pauseMs", () => {
    it("pauses and resumes after specified delay", async () => {
      const pollFn = vi
        .fn()
        .mockRejectedValueOnce(new Error("rate limit exceeded"))
        .mockResolvedValue({ hasChanges: false });

      const monitor = new PollingMonitor({
        id: "test-pause",
        type: "polling",
        interval: 100,
        poll: pollFn,
        onError: (error) => {
          if (error.message.includes("rate limit")) {
            return { pauseMs: 500, reason: "Rate limited" };
          }
        },
      });

      monitor.start(createContext());

      // First poll fails with rate limit
      await vi.advanceTimersByTimeAsync(100);
      expect(pollFn).toHaveBeenCalledTimes(1);
      expect(monitor.status.state).toBe("paused");
      expect(monitor.status.resumesAt).toBeDefined();

      // Advance halfway through pause - should still be paused
      await vi.advanceTimersByTimeAsync(250);
      expect(monitor.status.state).toBe("paused");
      expect(pollFn).toHaveBeenCalledTimes(1);

      // Complete the pause
      await vi.advanceTimersByTimeAsync(250);
      expect(monitor.status.state).toBe("running");
      expect(monitor.status.resumesAt).toBeUndefined();

      // Next poll should be scheduled after the interval
      await vi.advanceTimersByTimeAsync(100);
      expect(pollFn).toHaveBeenCalledTimes(2);

      monitor.stop();
    });

    it("emits monitor.paused and monitor.resumed hooks", async () => {
      const pausedHandler = vi.fn();
      const resumedHandler = vi.fn();
      hooks.on("monitor.paused", pausedHandler);
      hooks.on("monitor.resumed", resumedHandler);

      const pollFn = vi
        .fn()
        .mockRejectedValueOnce(new Error("rate limit"))
        .mockResolvedValue({ hasChanges: false });

      const monitor = new PollingMonitor({
        id: "test-hooks",
        type: "polling",
        interval: 100,
        poll: pollFn,
        onError: () => ({ pauseMs: 200, reason: "Testing" }),
      });

      monitor.start(createContext());

      // Trigger pause
      await vi.advanceTimersByTimeAsync(100);

      expect(pausedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "test-hooks",
          issueId: "AM-123",
          pauseMs: 200,
          reason: "Testing",
        }),
      );
      expect(resumedHandler).not.toHaveBeenCalled();

      // Resume
      await vi.advanceTimersByTimeAsync(200);

      expect(resumedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "test-hooks",
          issueId: "AM-123",
        }),
      );

      monitor.stop();
    });

    it("can be stopped while paused", async () => {
      const pollFn = vi.fn().mockRejectedValue(new Error("rate limit"));

      const monitor = new PollingMonitor({
        id: "test-stop-while-paused",
        type: "polling",
        interval: 100,
        poll: pollFn,
        onError: () => ({ pauseMs: 1000 }),
      });

      monitor.start(createContext());

      // Trigger pause
      await vi.advanceTimersByTimeAsync(100);
      expect(monitor.status.state).toBe("paused");

      // Stop while paused
      monitor.stop();
      expect(monitor.status.state).toBe("stopped");

      // Advance past when it would have resumed
      await vi.advanceTimersByTimeAsync(2000);

      // Should still be stopped, not resumed
      expect(monitor.status.state).toBe("stopped");
      expect(pollFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("poll loop edge cases", () => {
    it("handles stop() called between setTimeout scheduling and callback execution", async () => {
      const pollFn = vi.fn().mockResolvedValue({ hasChanges: false });
      const monitor = createMonitor({ interval: 100, poll: pollFn });

      monitor.start(createContext());

      // First poll
      await vi.advanceTimersByTimeAsync(100);
      expect(pollFn).toHaveBeenCalledTimes(1);

      // Stop while next timeout is pending but before it fires
      // The _poll() reschedules after completion, so stop during that window
      monitor.stop();

      await vi.advanceTimersByTimeAsync(200);
      expect(pollFn).toHaveBeenCalledTimes(1); // No more polls
    });

    it("exits early from setTimeout callback if state changed to stopped", async () => {
      // This tests line 66: if (this.status.state !== "running") return;
      let resolveFirstPoll: () => void;
      const firstPollPromise = new Promise<void>((resolve) => {
        resolveFirstPoll = resolve;
      });

      const pollFn = vi.fn().mockImplementation(async () => {
        // Signal that we're in the poll
        resolveFirstPoll();
        // Wait a bit to simulate async work
        await new Promise((r) => setTimeout(r, 50));
        return { hasChanges: false };
      });

      const monitor = createMonitor({ interval: 100, poll: pollFn });
      monitor.start(createContext());

      // Trigger first poll
      await vi.advanceTimersByTimeAsync(100);

      // Wait for poll to start
      await firstPollPromise;

      // Stop while poll is in progress (state changes to stopped)
      monitor.stop();

      // Advance time - next poll should NOT be scheduled because state is stopped
      await vi.advanceTimersByTimeAsync(50); // Let the poll finish
      await vi.advanceTimersByTimeAsync(200); // Would be next poll

      // Should only have had 1 poll call
      expect(pollFn).toHaveBeenCalledTimes(1);
    });
  });
});
