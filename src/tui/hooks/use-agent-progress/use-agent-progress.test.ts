/**
 * Tests for useAgentProgress hook
 * Uses dependency injection instead of mock.module() to avoid interference issues.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createRoot } from "solid-js";
import { useAgentProgress } from "./use-agent-progress.ts";
import type { UseAgentProgressDeps } from "./types.ts";
import type { SessionMemory } from "#core/session/session-types.ts";

describe("useAgentProgress", () => {
  let mockDeps: UseAgentProgressDeps;

  beforeEach(() => {
    mockDeps = {
      readSessionMemory: mock<(worktreePath: string) => SessionMemory | null>(() => null),
      hasSessionMemory: mock<(worktreePath: string) => boolean>(() => false),
    };
  });

  it("should return default progress for idle state", () => {
    (mockDeps.hasSessionMemory as ReturnType<typeof mock>).mockImplementation(() => false);

    createRoot((dispose) => {
      const result = useAgentProgress(
        {
          ticketId: "AM-123",
          worktreePath: null,
          agentState: "idle",
        },
        mockDeps,
      );

      const progress = result.progress();
      expect(progress.state).toBe("idle");
      expect(progress.stateLabel).toBe("Idle");
      expect(progress.stateIndicator).toBe("○");
      expect(progress.runningDuration).toBeNull();
      expect(progress.recentActivity).toEqual([]);
      expect(progress.hasSessionMemory).toBe(false);

      dispose();
    });
  });

  it("should return running state with duration", () => {
    const startedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 minutes ago
    (mockDeps.hasSessionMemory as ReturnType<typeof mock>).mockImplementation(() => true);
    (mockDeps.readSessionMemory as ReturnType<typeof mock>).mockImplementation(() => ({
      ticketId: "AM-123",
      status: "implementing",
      agent: "opencode",
      branch: "feat/AM-123",
      startedAt,
      lastUpdatedAt: new Date().toISOString(),
      summary: "Implementing feature",
      recentActivity: [
        { timestamp: new Date().toISOString(), type: "status_change", description: "Started work" },
      ],
      keyDecisions: ["Use React hooks"],
    }));

    createRoot((dispose) => {
      const result = useAgentProgress(
        {
          ticketId: "AM-123",
          worktreePath: "/path/to/worktree",
          agentState: "running",
        },
        mockDeps,
      );

      // Call refresh to load session memory
      result.refresh();

      const progress = result.progress();
      expect(progress.state).toBe("running");
      expect(progress.stateLabel).toBe("Running");
      expect(progress.stateIndicator).toBe("●");
      expect(progress.runningDuration).toBe("5m");
      expect(progress.summary).toBe("Implementing feature");
      expect(progress.recentActivity).toHaveLength(1);
      expect(progress.keyDecisions).toEqual(["Use React hooks"]);
      expect(progress.hasSessionMemory).toBe(true);

      dispose();
    });
  });

  it("should handle crashed state", () => {
    (mockDeps.hasSessionMemory as ReturnType<typeof mock>).mockImplementation(() => true);
    (mockDeps.readSessionMemory as ReturnType<typeof mock>).mockImplementation(() => ({
      ticketId: "AM-123",
      status: "blocked",
      agent: "opencode",
      branch: "feat/AM-123",
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      summary: "Agent crashed",
      recentActivity: [],
      keyDecisions: [],
    }));

    createRoot((dispose) => {
      const result = useAgentProgress(
        {
          ticketId: "AM-123",
          worktreePath: "/path/to/worktree",
          agentState: "crashed",
        },
        mockDeps,
      );

      // Call refresh to load session memory
      result.refresh();

      const progress = result.progress();
      expect(progress.state).toBe("crashed");
      expect(progress.stateLabel).toBe("Crashed");
      expect(progress.stateIndicator).toBe("✗");
      expect(progress.runningDuration).toBeNull();
      expect(progress.hasSessionMemory).toBe(true);

      dispose();
    });
  });

  it("should handle missing worktree path", () => {
    createRoot((dispose) => {
      const result = useAgentProgress(
        {
          ticketId: "AM-123",
          worktreePath: null,
          agentState: "idle",
        },
        mockDeps,
      );

      const progress = result.progress();
      expect(progress.hasSessionMemory).toBe(false);
      expect(progress.recentActivity).toEqual([]);
      expect(mockDeps.hasSessionMemory).not.toHaveBeenCalled();

      dispose();
    });
  });

  it("should expose refresh function", () => {
    (mockDeps.hasSessionMemory as ReturnType<typeof mock>).mockImplementation(() => false);

    createRoot((dispose) => {
      const result = useAgentProgress(
        {
          ticketId: "AM-123",
          worktreePath: null,
          agentState: "idle",
        },
        mockDeps,
      );

      expect(typeof result.refresh).toBe("function");
      expect(result.isLoading()).toBe(false);
      expect(result.error()).toBeNull();

      dispose();
    });
  });

  it("should format duration correctly", () => {
    const testCases = [
      { ms: 30 * 1000, expected: "30s" },
      { ms: 5 * 60 * 1000, expected: "5m" },
      { ms: 65 * 60 * 1000, expected: "1h 5m" },
      { ms: 2 * 60 * 60 * 1000, expected: "2h" },
    ];

    for (const { ms, expected } of testCases) {
      const startedAt = new Date(Date.now() - ms).toISOString();
      (mockDeps.hasSessionMemory as ReturnType<typeof mock>).mockImplementation(() => true);
      (mockDeps.readSessionMemory as ReturnType<typeof mock>).mockImplementation(() => ({
        ticketId: "AM-123",
        status: "implementing",
        agent: "opencode",
        branch: "feat/AM-123",
        startedAt,
        lastUpdatedAt: new Date().toISOString(),
        summary: "",
        recentActivity: [],
        keyDecisions: [],
      }));

      createRoot((dispose) => {
        const result = useAgentProgress(
          {
            ticketId: "AM-123",
            worktreePath: "/path/to/worktree",
            agentState: "running",
          },
          mockDeps,
        );

        // Call refresh to load session memory
        result.refresh();

        const progress = result.progress();
        expect(progress.runningDuration).toBe(expected);

        dispose();
      });
    }
  });

  it("should handle stopped state", () => {
    (mockDeps.hasSessionMemory as ReturnType<typeof mock>).mockImplementation(() => true);
    (mockDeps.readSessionMemory as ReturnType<typeof mock>).mockImplementation(() => ({
      ticketId: "AM-123",
      status: "done",
      agent: "opencode",
      branch: "feat/AM-123",
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      summary: "Work completed",
      recentActivity: [],
      keyDecisions: [],
    }));

    createRoot((dispose) => {
      const result = useAgentProgress(
        {
          ticketId: "AM-123",
          worktreePath: "/path/to/worktree",
          agentState: "stopped",
        },
        mockDeps,
      );

      result.refresh();

      const progress = result.progress();
      expect(progress.state).toBe("stopped");
      expect(progress.stateLabel).toBe("Stopped");

      dispose();
    });
  });

  it("should handle isLoading state during refresh", () => {
    (mockDeps.hasSessionMemory as ReturnType<typeof mock>).mockImplementation(() => true);
    // Return immediately for test
    (mockDeps.readSessionMemory as ReturnType<typeof mock>).mockImplementation(() => ({
      ticketId: "AM-123",
      status: "implementing",
      agent: "opencode",
      branch: "feat/AM-123",
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      summary: "",
      recentActivity: [],
      keyDecisions: [],
    }));

    createRoot((dispose) => {
      const result = useAgentProgress(
        {
          ticketId: "AM-123",
          worktreePath: "/path/to/worktree",
          agentState: "running",
        },
        mockDeps,
      );

      // Initially not loading
      expect(result.isLoading()).toBe(false);

      // Call refresh
      result.refresh();

      // After sync refresh, loading should be false
      expect(result.isLoading()).toBe(false);

      dispose();
    });
  });

  it("should handle error during session memory read", () => {
    (mockDeps.hasSessionMemory as ReturnType<typeof mock>).mockImplementation(() => true);
    (mockDeps.readSessionMemory as ReturnType<typeof mock>).mockImplementation(() => {
      throw new Error("Failed to read");
    });

    createRoot((dispose) => {
      const result = useAgentProgress(
        {
          ticketId: "AM-123",
          worktreePath: "/path/to/worktree",
          agentState: "running",
        },
        mockDeps,
      );

      result.refresh();

      // Should have error
      expect(result.error()).toBeTruthy();

      dispose();
    });
  });

  it("should return default state when session memory is empty", () => {
    (mockDeps.hasSessionMemory as ReturnType<typeof mock>).mockImplementation(() => true);
    (mockDeps.readSessionMemory as ReturnType<typeof mock>).mockImplementation(() => null);

    createRoot((dispose) => {
      const result = useAgentProgress(
        {
          ticketId: "AM-123",
          worktreePath: "/path/to/worktree",
          agentState: "running",
        },
        mockDeps,
      );

      result.refresh();

      const progress = result.progress();
      expect(progress.hasSessionMemory).toBe(false);
      expect(progress.summary).toBeNull();

      dispose();
    });
  });
});
