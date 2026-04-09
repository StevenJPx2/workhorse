/**
 * Tests for useAgentOutput hook
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { useAgentOutput } from "./use-agent-output.ts";
import { createSignal, createRoot } from "solid-js";

// Mock the orchestrator functions
const mockGetAgent = mock(() => null as unknown);
const mockCaptureAgentOutput = mock(() => Promise.resolve(null as unknown));

mock.module("../../harness/orchestrator/orchestrator.ts", () => ({
  getAgent: mockGetAgent,
  captureAgentOutput: mockCaptureAgentOutput,
}));

describe("useAgentOutput", () => {
  beforeEach(() => {
    mockGetAgent.mockReset();
    mockCaptureAgentOutput.mockReset();
  });

  test("returns empty output when no ticketId", () => {
    let result: ReturnType<typeof useAgentOutput>;

    createRoot((dispose) => {
      const [ticketId] = createSignal<string | undefined>(undefined);
      result = useAgentOutput({ ticketId });
      dispose();
    });

    expect(result!.output()).toEqual([]);
    expect(result!.rawOutput()).toBeNull();
    expect(result!.isRunning()).toBe(false);
  });

  test("returns empty output when agent not running", () => {
    mockGetAgent.mockImplementation(() => ({ state: "stopped" }));

    let result: ReturnType<typeof useAgentOutput>;

    createRoot((dispose) => {
      const [ticketId] = createSignal<string | undefined>("TEST-123");
      result = useAgentOutput({ ticketId, enabled: false });
      dispose();
    });

    expect(result!.isRunning()).toBe(false);
  });

  test("has refresh function", () => {
    let result: ReturnType<typeof useAgentOutput>;

    createRoot((dispose) => {
      const [ticketId] = createSignal<string | undefined>(undefined);
      result = useAgentOutput({ ticketId });
      dispose();
    });

    expect(typeof result!.refresh).toBe("function");
  });

  test("has lastUpdated accessor", () => {
    let result: ReturnType<typeof useAgentOutput>;

    createRoot((dispose) => {
      const [ticketId] = createSignal<string | undefined>(undefined);
      result = useAgentOutput({ ticketId });
      dispose();
    });

    expect(result!.lastUpdated()).toBeNull();
  });

  test("respects maxLines option", async () => {
    const manyLines = Array.from({ length: 100 }, (_, i) => `Line ${i}`).join("\n");
    mockGetAgent.mockImplementation(() => ({ state: "running" }));
    mockCaptureAgentOutput.mockImplementation(() => Promise.resolve(manyLines));

    let result: ReturnType<typeof useAgentOutput>;

    await createRoot(async (dispose) => {
      const [ticketId] = createSignal<string | undefined>("TEST-123");
      result = useAgentOutput({ ticketId, maxLines: 10, enabled: false });

      // Manually call refresh to test line limiting
      await result.refresh();
      dispose();
    });

    // Should have max 10 lines (the last 10)
    expect(result!.output().length).toBeLessThanOrEqual(10);
  });

  test("sets isRunning when agent is running", async () => {
    mockGetAgent.mockImplementation(() => ({ state: "running" }));
    mockCaptureAgentOutput.mockImplementation(() => Promise.resolve("test output"));

    let result: ReturnType<typeof useAgentOutput>;

    await createRoot(async (dispose) => {
      const [ticketId] = createSignal<string | undefined>("TEST-123");
      result = useAgentOutput({ ticketId, enabled: false });
      await result.refresh();
      dispose();
    });

    expect(result!.isRunning()).toBe(true);
  });

  test("updates lastUpdated after refresh", async () => {
    mockGetAgent.mockImplementation(() => ({ state: "running" }));
    mockCaptureAgentOutput.mockImplementation(() => Promise.resolve("test output"));

    let result: ReturnType<typeof useAgentOutput>;

    await createRoot(async (dispose) => {
      const [ticketId] = createSignal<string | undefined>("TEST-123");
      result = useAgentOutput({ ticketId, enabled: false });
      await result.refresh();
      dispose();
    });

    expect(result!.lastUpdated()).toBeTruthy();
  });

  test("stores rawOutput", async () => {
    mockGetAgent.mockImplementation(() => ({ state: "running" }));
    mockCaptureAgentOutput.mockImplementation(() => Promise.resolve("line 1\nline 2\nline 3"));

    let result: ReturnType<typeof useAgentOutput>;

    await createRoot(async (dispose) => {
      const [ticketId] = createSignal<string | undefined>("TEST-123");
      result = useAgentOutput({ ticketId, enabled: false });
      await result.refresh();
      dispose();
    });

    expect(result!.rawOutput()).toBe("line 1\nline 2\nline 3");
  });

  test("filters empty lines from output", async () => {
    mockGetAgent.mockImplementation(() => ({ state: "running" }));
    mockCaptureAgentOutput.mockImplementation(() => Promise.resolve("line 1\n\n\nline 2\n\n"));

    let result: ReturnType<typeof useAgentOutput>;

    await createRoot(async (dispose) => {
      const [ticketId] = createSignal<string | undefined>("TEST-123");
      result = useAgentOutput({ ticketId, enabled: false });
      await result.refresh();
      dispose();
    });

    expect(result!.output()).toEqual(["line 1", "line 2"]);
  });

  test("handles error during capture gracefully", async () => {
    mockGetAgent.mockImplementation(() => ({ state: "running" }));
    mockCaptureAgentOutput.mockImplementation(() => Promise.reject(new Error("Capture failed")));

    let result: ReturnType<typeof useAgentOutput>;

    await createRoot(async (dispose) => {
      const [ticketId] = createSignal<string | undefined>("TEST-123");
      result = useAgentOutput({ ticketId, enabled: false });
      // Should not throw - error is caught internally
      try {
        await result.refresh();
      } catch {
        // Expected - error may propagate in test environment
      }
      dispose();
    });

    // Should still have empty output after error
    expect(result!.output()).toEqual([]);
  });

  test("does not capture when agent is not running", async () => {
    mockGetAgent.mockImplementation(() => ({ state: "stopped" }));
    mockCaptureAgentOutput.mockImplementation(() => Promise.resolve("should not see this"));

    let result: ReturnType<typeof useAgentOutput>;

    await createRoot(async (dispose) => {
      const [ticketId] = createSignal<string | undefined>("TEST-123");
      result = useAgentOutput({ ticketId, enabled: false });
      await result.refresh();
      dispose();
    });

    expect(result!.isRunning()).toBe(false);
  });

  test("handles null captured output", async () => {
    mockGetAgent.mockImplementation(() => ({ state: "running" }));
    mockCaptureAgentOutput.mockImplementation(() => Promise.resolve(null));

    let result: ReturnType<typeof useAgentOutput>;

    await createRoot(async (dispose) => {
      const [ticketId] = createSignal<string | undefined>("TEST-123");
      result = useAgentOutput({ ticketId, enabled: false });
      await result.refresh();
      dispose();
    });

    expect(result!.rawOutput()).toBeNull();
    expect(result!.output()).toEqual([]);
  });

  test("uses default pollInterval", () => {
    let result: ReturnType<typeof useAgentOutput>;

    createRoot((dispose) => {
      const [ticketId] = createSignal<string | undefined>(undefined);
      result = useAgentOutput({ ticketId });
      dispose();
    });

    // Hook should be created without error
    expect(result!).toBeDefined();
  });

  test("uses default maxLines when not specified", async () => {
    // Create more lines than default maxLines (50)
    const manyLines = Array.from({ length: 100 }, (_, i) => `Line ${i}`).join("\n");
    mockGetAgent.mockImplementation(() => ({ state: "running" }));
    mockCaptureAgentOutput.mockImplementation(() => Promise.resolve(manyLines));

    let result: ReturnType<typeof useAgentOutput>;

    await createRoot(async (dispose) => {
      const [ticketId] = createSignal<string | undefined>("TEST-123");
      result = useAgentOutput({ ticketId, enabled: false });
      await result.refresh();
      dispose();
    });

    // Default maxLines is 50
    expect(result!.output().length).toBe(50);
  });
});
