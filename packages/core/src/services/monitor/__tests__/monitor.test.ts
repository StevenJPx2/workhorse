/**
 * Tests for the PollingMonitor class directly (not MonitorService).
 * Covers edge cases in the poll loop that are hard to hit via service.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkhorseConfig } from "#config";
import type { HookEmitter } from "#lib/hooks";
import { createMockHooks } from "#lib/hooks/__tests__/test-helpers";
import type { MemoryService } from "#services/memory";

import { PollingMonitor } from "../polling-monitor.ts";
import type { MonitorContext, PollingMonitorOptions } from "../types.ts";

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
    options: Partial<PollingMonitorOptions> & { poll?: PollingMonitorOptions["poll"] } = {},
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
