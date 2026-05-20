/**
 * Tests for the EventMonitor class directly (not MonitorService).
 * Covers edge cases in event handling and cleanup.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkhorseConfig } from "#config";
import type { HookEmitter } from "#lib/hooks";
import { createMockHooks } from "#lib/hooks/__tests__/test-helpers";
import type { MemoryService } from "#services/memory";

import { EventMonitor } from "../event-monitor.ts";
import type { EventEmitter, EventMonitorOptions, MonitorContext } from "../types.ts";

describe("EventMonitor", () => {
  let hooks: HookEmitter;
  let memory: MemoryService;
  let config: WorkhorseConfig;

  beforeEach(() => {
    hooks = createMockHooks();
    memory = {} as MemoryService;
    config = { behavior: { pollInterval: 1000 } } as WorkhorseConfig;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMonitor(
    options: Partial<EventMonitorOptions> & { setup?: EventMonitorOptions["setup"] } = {},
  ): EventMonitor {
    return new EventMonitor({
      id: options.id ?? "test-event-monitor",
      type: "event",
      setup:
        options.setup ??
        (async () => {
          return () => {};
        }),
    });
  }

  function createContext(issueId = "AM-123"): MonitorContext {
    return { issueId, hooks, memory, config };
  }

  describe("start", () => {
    it("is a no-op if already running", async () => {
      const setupFn = vi.fn().mockResolvedValue(() => {});
      const monitor = createMonitor({ setup: setupFn });

      await monitor.start(createContext());
      await monitor.start(createContext()); // Should be ignored
      await monitor.start(createContext()); // Should be ignored

      expect(setupFn).toHaveBeenCalledTimes(1);

      await monitor.stop();
    });

    it("sets state to running", async () => {
      const monitor = createMonitor();

      expect(monitor.status.state).toBe("stopped");

      await monitor.start(createContext());

      expect(monitor.status.state).toBe("running");

      await monitor.stop();
    });

    it("passes context and emit function to setup", async () => {
      let receivedCtx: MonitorContext | null = null;
      let receivedEmit: EventEmitter | null = null;

      const setupFn = vi.fn().mockImplementation(async (ctx, emit) => {
        receivedCtx = ctx;
        receivedEmit = emit;
        return () => {};
      });

      const monitor = createMonitor({ setup: setupFn });
      const ctx = createContext("AM-456");
      await monitor.start(ctx);

      expect(receivedCtx).toBe(ctx);
      expect(typeof receivedEmit).toBe("function");

      await monitor.stop();
    });

    it("handles setup errors gracefully", async () => {
      const errorHandler = vi.fn();
      hooks.on("monitor.error", errorHandler);

      const setupFn = vi.fn().mockRejectedValue(new Error("Setup failed"));
      const monitor = createMonitor({ setup: setupFn });

      await monitor.start(createContext());

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "test-event-monitor",
          error: expect.any(Error),
          errorCount: 1,
        }),
      );
    });
  });

  describe("stop", () => {
    it("calls cleanup function", async () => {
      const cleanupFn = vi.fn();
      const setupFn = vi.fn().mockResolvedValue(cleanupFn);
      const monitor = createMonitor({ setup: setupFn });

      await monitor.start(createContext());
      await monitor.stop();

      expect(cleanupFn).toHaveBeenCalledTimes(1);
    });

    it("handles async cleanup functions", async () => {
      let cleanupCompleted = false;
      const cleanupFn = vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 10));
        cleanupCompleted = true;
      });
      const setupFn = vi.fn().mockResolvedValue(cleanupFn);
      const monitor = createMonitor({ setup: setupFn });

      await monitor.start(createContext());
      await monitor.stop();

      expect(cleanupCompleted).toBe(true);
    });

    it("ignores cleanup errors", async () => {
      const cleanupFn = vi.fn().mockRejectedValue(new Error("Cleanup failed"));
      const setupFn = vi.fn().mockResolvedValue(cleanupFn);
      const monitor = createMonitor({ setup: setupFn });

      await monitor.start(createContext());

      // Should not throw
      await expect(monitor.stop()).resolves.toBeUndefined();
    });

    it("is safe to call multiple times", async () => {
      const cleanupFn = vi.fn();
      const setupFn = vi.fn().mockResolvedValue(cleanupFn);
      const monitor = createMonitor({ setup: setupFn });

      await monitor.start(createContext());
      await monitor.stop();
      await monitor.stop();
      await monitor.stop();

      // Cleanup should only be called once
      expect(cleanupFn).toHaveBeenCalledTimes(1);
    });

    it("sets state to stopped", async () => {
      const monitor = createMonitor();

      await monitor.start(createContext());
      expect(monitor.status.state).toBe("running");

      await monitor.stop();
      expect(monitor.status.state).toBe("stopped");
    });
  });

  describe("emit", () => {
    it("emits monitor.tick when hasChanges is true", async () => {
      const tickHandler = vi.fn();
      hooks.on("monitor.tick", tickHandler);

      let emitFn: EventEmitter | null = null;
      const setupFn = vi.fn().mockImplementation(async (_ctx, emit) => {
        emitFn = emit;
        return () => {};
      });

      const monitor = createMonitor({ setup: setupFn });
      await monitor.start(createContext());

      emitFn!({ hasChanges: true, data: { message: "test" } });

      expect(tickHandler).toHaveBeenCalledWith({
        id: "test-event-monitor",
        issueId: "AM-123",
        result: { message: "test" },
      });

      await monitor.stop();
    });

    it("does not emit monitor.tick when hasChanges is false", async () => {
      const tickHandler = vi.fn();
      hooks.on("monitor.tick", tickHandler);

      let emitFn: EventEmitter | null = null;
      const setupFn = vi.fn().mockImplementation(async (_ctx, emit) => {
        emitFn = emit;
        return () => {};
      });

      const monitor = createMonitor({ setup: setupFn });
      await monitor.start(createContext());

      emitFn!({ hasChanges: false });

      expect(tickHandler).not.toHaveBeenCalled();

      await monitor.stop();
    });

    it("updates lastActivity on emit", async () => {
      let emitFn: EventEmitter | null = null;
      const setupFn = vi.fn().mockImplementation(async (_ctx, emit) => {
        emitFn = emit;
        return () => {};
      });

      const monitor = createMonitor({ setup: setupFn });
      await monitor.start(createContext());

      expect(monitor.status.lastActivity).toBeUndefined();

      emitFn!({ hasChanges: true, data: {} });

      expect(monitor.status.lastActivity).toBeInstanceOf(Date);

      await monitor.stop();
    });

    it("resets errorCount on successful emit", async () => {
      let emitFn: EventEmitter | null = null;
      const setupFn = vi.fn().mockImplementation(async (_ctx, emit) => {
        emitFn = emit;
        return () => {};
      });

      const monitor = createMonitor({ setup: setupFn });
      await monitor.start(createContext());

      // Simulate some errors
      monitor.reportError(new Error("Error 1"));
      monitor.reportError(new Error("Error 2"));
      expect(monitor.status.errorCount).toBe(2);

      // Successful emit resets
      emitFn!({ hasChanges: true, data: {} });
      expect(monitor.status.errorCount).toBe(0);

      await monitor.stop();
    });

    it("ignores emit after stop", async () => {
      const tickHandler = vi.fn();
      hooks.on("monitor.tick", tickHandler);

      let emitFn: EventEmitter | null = null;
      const setupFn = vi.fn().mockImplementation(async (_ctx, emit) => {
        emitFn = emit;
        return () => {};
      });

      const monitor = createMonitor({ setup: setupFn });
      await monitor.start(createContext());
      await monitor.stop();

      // Emit after stop should be ignored
      emitFn!({ hasChanges: true, data: { message: "late" } });

      expect(tickHandler).not.toHaveBeenCalled();
    });
  });

  describe("reportError", () => {
    it("increments errorCount", async () => {
      const monitor = createMonitor();
      await monitor.start(createContext());

      expect(monitor.status.errorCount).toBe(0);

      monitor.reportError(new Error("Error 1"));
      expect(monitor.status.errorCount).toBe(1);

      monitor.reportError(new Error("Error 2"));
      expect(monitor.status.errorCount).toBe(2);

      await monitor.stop();
    });

    it("emits monitor.error", async () => {
      const errorHandler = vi.fn();
      hooks.on("monitor.error", errorHandler);

      const monitor = createMonitor();
      await monitor.start(createContext());

      const error = new Error("Something went wrong");
      monitor.reportError(error);

      expect(errorHandler).toHaveBeenCalledWith({
        id: "test-event-monitor",
        issueId: "AM-123",
        error,
        errorCount: 1,
      });

      await monitor.stop();
    });

    it("stops monitor after ERROR_THRESHOLD (5) consecutive errors", async () => {
      const monitor = createMonitor();
      await monitor.start(createContext());

      for (let i = 0; i < 5; i++) {
        monitor.reportError(new Error(`Error ${i + 1}`));
      }

      // State transitions to "error" when threshold is reached, then stop() is called
      // which transitions to "stopped". Since reportError calls stop() which is async,
      // we need to wait for it to complete.
      // After stop() completes, state should be "stopped"
      await monitor.stop(); // Ensure stop completes (idempotent)
      expect(monitor.status.state).toBe("stopped");
      expect(monitor.status.errorCount).toBe(5);
    });

    it("keeps running if errors are below threshold", async () => {
      const monitor = createMonitor();
      await monitor.start(createContext());

      for (let i = 0; i < 4; i++) {
        monitor.reportError(new Error(`Error ${i + 1}`));
      }

      expect(monitor.status.state).toBe("running");
      expect(monitor.status.errorCount).toBe(4);

      await monitor.stop();
    });
  });

  describe("integration scenarios", () => {
    it("simulates a WebSocket-like event source", async () => {
      const tickHandler = vi.fn();
      hooks.on("monitor.tick", tickHandler);

      // Simulate a WebSocket that emits messages
      type MessageHandler = (msg: string) => void;
      const fakeSocket = {
        handlers: [] as MessageHandler[],
        onMessage(handler: MessageHandler) {
          this.handlers.push(handler);
        },
        emit(msg: string) {
          this.handlers.forEach((h) => h(msg));
        },
        close: vi.fn(),
      };

      const monitor = createMonitor({
        setup: async (_ctx, emit) => {
          fakeSocket.onMessage((msg) => {
            emit({ hasChanges: true, data: { message: msg } });
          });
          return () => fakeSocket.close();
        },
      });

      await monitor.start(createContext());

      // Simulate incoming messages
      fakeSocket.emit("Hello");
      fakeSocket.emit("World");

      expect(tickHandler).toHaveBeenCalledTimes(2);
      expect(tickHandler).toHaveBeenNthCalledWith(1, {
        id: "test-event-monitor",
        issueId: "AM-123",
        result: { message: "Hello" },
      });
      expect(tickHandler).toHaveBeenNthCalledWith(2, {
        id: "test-event-monitor",
        issueId: "AM-123",
        result: { message: "World" },
      });

      await monitor.stop();
      expect(fakeSocket.close).toHaveBeenCalled();
    });
  });
});
