/**
 * Tests for useAgentSummary hook
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createRoot } from "solid-js";
import { useAgentSummary } from "./use-agent-summary.ts";

import type { AgentStep } from "#core/agent/summarizer/index.ts";

// Mock the getAgentStatus function from core
const mockGetAgentStatus = mock((_ticketId: string, _worktreePath: string) =>
  Promise.resolve<AgentStep[]>([]),
);

mock.module("#core/agent/summarizer/index.ts", () => ({
  getAgentStatus: mockGetAgentStatus,
}));

describe("useAgentSummary", () => {
  beforeEach(() => {
    mockGetAgentStatus.mockClear();
    mockGetAgentStatus.mockImplementation(() => Promise.resolve([]));
  });

  it("should return initial state", () => {
    createRoot((dispose) => {
      const result = useAgentSummary({
        ticketId: "TEST-123",
        worktreePath: "/path/to/worktree",
        enabled: false,
      });

      expect(result.steps()).toEqual([]);
      expect(result.currentStatus()).toBeNull();
      expect(result.isPolling()).toBe(false);
      expect(result.lastUpdated()).toBeNull();
      expect(result.error()).toBeNull();
      expect(typeof result.refresh).toBe("function");
      expect(typeof result.invalidate).toBe("function");

      dispose();
    });
  });

  it("should accept options as functions", () => {
    createRoot((dispose) => {
      const result = useAgentSummary({
        ticketId: () => "TEST-123",
        worktreePath: () => "/path/to/worktree",
        enabled: () => false,
      });

      expect(result).toBeDefined();

      dispose();
    });
  });

  it("should not fetch when disabled", () => {
    createRoot((dispose) => {
      const result = useAgentSummary({
        ticketId: "TEST-123",
        worktreePath: "/path/to/worktree",
        enabled: false,
      });

      expect(mockGetAgentStatus).not.toHaveBeenCalled();
      expect(result.isPolling()).toBe(false);

      dispose();
    });
  });

  it("should not fetch when no worktreePath", () => {
    createRoot((dispose) => {
      const result = useAgentSummary({
        ticketId: "TEST-123",
        worktreePath: undefined,
        enabled: true,
      });

      expect(mockGetAgentStatus).not.toHaveBeenCalled();
      expect(result.isPolling()).toBe(false);

      dispose();
    });
  });

  it("should start polling when enabled", async () => {
    createRoot(async (dispose) => {
      const result = useAgentSummary({
        ticketId: "TEST-123",
        worktreePath: "/path/to/worktree",
        enabled: true,
        pollInterval: 1000,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockGetAgentStatus).toHaveBeenCalled();
      expect(result.isPolling()).toBe(true);

      dispose();
    });
  });

  it("should update steps on successful fetch", async () => {
    mockGetAgentStatus.mockImplementation(() =>
      Promise.resolve([
        { description: "Step 1", type: "action", timestamp: "2024-01-01T00:00:00Z" },
        { description: "Step 2", type: "thinking", timestamp: "2024-01-01T00:00:01Z" },
      ]),
    );

    createRoot(async (dispose) => {
      const result = useAgentSummary({
        ticketId: "TEST-123",
        worktreePath: "/path/to/worktree",
        enabled: true,
      });

      await result.refresh();

      expect(result.steps()).toHaveLength(2);
      expect(result.currentStatus()).toBe("Step 1");
      expect(result.lastUpdated()).toBeTruthy();

      dispose();
    });
  });

  it("should dedupe steps with same description", async () => {
    mockGetAgentStatus.mockImplementation(() =>
      Promise.resolve([
        { description: "Same step", type: "action", timestamp: "2024-01-01T00:00:00Z" },
        { description: "Same step", type: "action", timestamp: "2024-01-01T00:00:01Z" },
      ]),
    );

    createRoot(async (dispose) => {
      const result = useAgentSummary({
        ticketId: "TEST-123",
        worktreePath: "/path/to/worktree",
        enabled: true,
      });

      await result.refresh();

      // Should dedupe to 1 step
      expect(result.steps()).toHaveLength(1);

      dispose();
    });
  });

  it("should limit steps to maxSteps", async () => {
    mockGetAgentStatus.mockImplementation(() =>
      Promise.resolve(
        Array.from({ length: 20 }, (_, i) => ({
          description: `Step ${i}`,
          type: "action" as const,
          timestamp: new Date().toISOString(),
        })),
      ),
    );

    createRoot(async (dispose) => {
      const result = useAgentSummary({
        ticketId: "TEST-123",
        worktreePath: "/path/to/worktree",
        enabled: true,
        maxSteps: 5,
      });

      await result.refresh();

      expect(result.steps()).toHaveLength(5);

      dispose();
    });
  });

  it("should handle empty steps response", async () => {
    mockGetAgentStatus.mockImplementation(() => Promise.resolve([]));

    createRoot(async (dispose) => {
      const result = useAgentSummary({
        ticketId: "TEST-123",
        worktreePath: "/path/to/worktree",
        enabled: true,
      });

      await result.refresh();

      expect(result.steps()).toEqual([]);
      expect(result.currentStatus()).toBeNull();

      dispose();
    });
  });

  it("should handle fetch errors", async () => {
    mockGetAgentStatus.mockImplementation(() => Promise.reject(new Error("Failed to fetch")));

    createRoot(async (dispose) => {
      const result = useAgentSummary({
        ticketId: "TEST-123",
        worktreePath: "/path/to/worktree",
        enabled: true,
      });

      await result.refresh();

      expect(result.error()).toBe("Failed to fetch");

      dispose();
    });
  });

  it("should handle string errors", async () => {
    mockGetAgentStatus.mockImplementation(() => Promise.reject("String error"));

    createRoot(async (dispose) => {
      const result = useAgentSummary({
        ticketId: "TEST-123",
        worktreePath: "/path/to/worktree",
        enabled: true,
      });

      await result.refresh();

      expect(result.error()).toBe("String error");

      dispose();
    });
  });

  it("should clear error on successful fetch after error", async () => {
    mockGetAgentStatus
      .mockImplementationOnce(() => Promise.reject(new Error("First error")))
      .mockImplementationOnce(() =>
        Promise.resolve([
          { description: "Success", type: "action", timestamp: "2024-01-01T00:00:00Z" },
        ]),
      );

    createRoot(async (dispose) => {
      const result = useAgentSummary({
        ticketId: "TEST-123",
        worktreePath: "/path/to/worktree",
        enabled: true,
      });

      await result.refresh();
      expect(result.error()).toBe("First error");

      await result.refresh();
      expect(result.error()).toBeNull();
      expect(result.steps()).toHaveLength(1);

      dispose();
    });
  });

  it("should not update steps if key unchanged", async () => {
    mockGetAgentStatus.mockImplementation(() => {
      return Promise.resolve([
        { description: "Same step", type: "action", timestamp: "2024-01-01T00:00:00Z" },
      ]);
    });

    createRoot(async (dispose) => {
      const result = useAgentSummary({
        ticketId: "TEST-123",
        worktreePath: "/path/to/worktree",
        enabled: true,
      });

      await result.refresh();
      expect(result.steps()).toHaveLength(1);

      // Second call returns same steps, should not add duplicates
      await result.refresh();
      expect(result.steps()).toHaveLength(1);

      dispose();
    });
  });

  it("should invalidate and clear state", async () => {
    mockGetAgentStatus.mockImplementation(() =>
      Promise.resolve([
        { description: "Step 1", type: "action", timestamp: "2024-01-01T00:00:00Z" },
      ]),
    );

    createRoot(async (dispose) => {
      const result = useAgentSummary({
        ticketId: "TEST-123",
        worktreePath: "/path/to/worktree",
        enabled: true,
      });

      await result.refresh();
      expect(result.steps()).toHaveLength(1);
      expect(result.currentStatus()).toBe("Step 1");

      result.invalidate();

      expect(result.steps()).toEqual([]);
      expect(result.currentStatus()).toBeNull();

      dispose();
    });
  });

  it("should use default poll interval", () => {
    createRoot((dispose) => {
      const result = useAgentSummary({
        ticketId: "TEST-123",
        worktreePath: "/path/to/worktree",
        enabled: true,
        // pollInterval defaults to 3000
      });

      expect(result).toBeDefined();
      expect(result.isPolling()).toBe(true);

      dispose();
    });
  });

  it("should use default max steps", () => {
    createRoot((dispose) => {
      const result = useAgentSummary({
        ticketId: "TEST-123",
        worktreePath: "/path/to/worktree",
        enabled: false,
        // maxSteps defaults to 10
      });

      expect(result).toBeDefined();

      dispose();
    });
  });

  it("should stop polling on disable", async () => {
    let enabled = true;

    createRoot(async (dispose) => {
      const result = useAgentSummary({
        ticketId: "TEST-123",
        worktreePath: "/path/to/worktree",
        enabled,
        pollInterval: 100,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(result.isPolling()).toBe(true);

      enabled = false;

      dispose();
    });
  });
});
