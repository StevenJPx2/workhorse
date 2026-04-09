/**
 * Tests for useAgentProgress hook
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { createRoot } from "solid-js";
import { useAgentProgress } from "./use-agent-progress.ts";
import * as sessionMemory from "../../harness/session/session-memory.ts";

// Mock the session memory module
vi.mock("../../harness/session/session-memory.ts", () => ({
  readSessionMemory: vi.fn(),
  hasSessionMemory: vi.fn(),
}));

describe("useAgentProgress", () => {
  let mockReadSessionMemory: Mock;
  let mockHasSessionMemory: Mock;

  beforeEach(() => {
    mockReadSessionMemory = sessionMemory.readSessionMemory as Mock;
    mockHasSessionMemory = sessionMemory.hasSessionMemory as Mock;
    mockReadSessionMemory.mockReset();
    mockHasSessionMemory.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return default progress for idle state", () => {
    mockHasSessionMemory.mockReturnValue(false);

    createRoot((dispose) => {
      const result = useAgentProgress({
        ticketId: "AM-123",
        worktreePath: null,
        agentState: "idle",
      });

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
    mockHasSessionMemory.mockReturnValue(true);
    mockReadSessionMemory.mockReturnValue({
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
    });

    createRoot((dispose) => {
      const result = useAgentProgress({
        ticketId: "AM-123",
        worktreePath: "/path/to/worktree",
        agentState: "running",
      });

      // Call refresh to load session memory (createEffect doesn't fire sync in tests)
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
    mockHasSessionMemory.mockReturnValue(true);
    mockReadSessionMemory.mockReturnValue({
      ticketId: "AM-123",
      status: "blocked",
      agent: "opencode",
      branch: "feat/AM-123",
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      summary: "Agent crashed",
      recentActivity: [],
      keyDecisions: [],
    });

    createRoot((dispose) => {
      const result = useAgentProgress({
        ticketId: "AM-123",
        worktreePath: "/path/to/worktree",
        agentState: "crashed",
      });

      // Call refresh to load session memory
      result.refresh();

      const progress = result.progress();
      expect(progress.state).toBe("crashed");
      expect(progress.stateLabel).toBe("Crashed");
      expect(progress.stateIndicator).toBe("✗");
      expect(progress.runningDuration).toBeNull(); // Not running, so no duration
      expect(progress.hasSessionMemory).toBe(true);

      dispose();
    });
  });

  it("should handle missing worktree path", () => {
    createRoot((dispose) => {
      const result = useAgentProgress({
        ticketId: "AM-123",
        worktreePath: null,
        agentState: "idle",
      });

      const progress = result.progress();
      expect(progress.hasSessionMemory).toBe(false);
      expect(progress.recentActivity).toEqual([]);
      expect(mockHasSessionMemory).not.toHaveBeenCalled();

      dispose();
    });
  });

  it("should expose refresh function", () => {
    mockHasSessionMemory.mockReturnValue(false);

    createRoot((dispose) => {
      const result = useAgentProgress({
        ticketId: "AM-123",
        worktreePath: null,
        agentState: "idle",
      });

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
      mockHasSessionMemory.mockReturnValue(true);
      mockReadSessionMemory.mockReturnValue({
        ticketId: "AM-123",
        status: "implementing",
        agent: "opencode",
        branch: "feat/AM-123",
        startedAt,
        lastUpdatedAt: new Date().toISOString(),
        summary: "",
        recentActivity: [],
        keyDecisions: [],
      });

      createRoot((dispose) => {
        const result = useAgentProgress({
          ticketId: "AM-123",
          worktreePath: "/path/to/worktree",
          agentState: "running",
        });

        // Call refresh to load session memory
        result.refresh();

        const progress = result.progress();
        expect(progress.runningDuration).toBe(expected);

        dispose();
      });
    }
  });
});
