/**
 * Tests for useAgentOutput hook
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { useAgentOutput } from "./use-agent-output.ts";
import { createRoot } from "solid-js";

// Mock captureOutput function
const mockCaptureOutput = mock(() => Promise.resolve(null as string | null));

describe("useAgentOutput", () => {
  beforeEach(() => {
    mockCaptureOutput.mockReset();
  });

  test("returns empty lines when no ticketId", () => {
    let result: ReturnType<typeof useAgentOutput>;

    createRoot((dispose) => {
      result = useAgentOutput({
        ticketId: undefined as unknown as string,
        isRunning: false,
        captureOutput: mockCaptureOutput,
      });
      dispose();
    });

    expect(result!.lines()).toEqual([]);
    expect(result!.isPolling()).toBe(false);
    expect(result!.error()).toBeNull();
  });

  test("returns empty lines when agent not running", () => {
    let result: ReturnType<typeof useAgentOutput>;

    createRoot((dispose) => {
      result = useAgentOutput({
        ticketId: "TEST-123",
        isRunning: false,
        captureOutput: mockCaptureOutput,
      });
      dispose();
    });

    expect(result!.lines()).toEqual([]);
    expect(result!.isPolling()).toBe(false);
  });

  test("has refresh function", () => {
    let result: ReturnType<typeof useAgentOutput>;

    createRoot((dispose) => {
      result = useAgentOutput({
        ticketId: undefined as unknown as string,
        isRunning: false,
        captureOutput: mockCaptureOutput,
      });
      dispose();
    });

    expect(typeof result!.refresh).toBe("function");
  });

  test("has lastUpdated accessor", () => {
    let result: ReturnType<typeof useAgentOutput>;

    createRoot((dispose) => {
      result = useAgentOutput({
        ticketId: undefined as unknown as string,
        isRunning: false,
        captureOutput: mockCaptureOutput,
      });
      dispose();
    });

    expect(result!.lastUpdated()).toBeNull();
  });

  test("respects maxLines option", async () => {
    const manyLines = Array.from({ length: 100 }, (_, i) => `Line ${i}`).join("\n");
    mockCaptureOutput.mockImplementation(() => Promise.resolve(manyLines));

    let result: ReturnType<typeof useAgentOutput>;

    await createRoot(async (dispose) => {
      result = useAgentOutput({
        ticketId: "TEST-123",
        isRunning: true,
        maxLines: 10,
        captureOutput: mockCaptureOutput,
      });

      // Manually call refresh to test line limiting
      await result.refresh();
      dispose();
    });

    // Should have max 10 lines (the last 10)
    expect(result!.lines().length).toBeLessThanOrEqual(10);
  });

  test("updates lastUpdated after refresh", async () => {
    mockCaptureOutput.mockImplementation(() => Promise.resolve("test output"));

    let result: ReturnType<typeof useAgentOutput>;

    await createRoot(async (dispose) => {
      result = useAgentOutput({
        ticketId: "TEST-123",
        isRunning: true,
        captureOutput: mockCaptureOutput,
      });
      await result.refresh();
      dispose();
    });

    expect(result!.lastUpdated()).toBeTruthy();
  });

  test("stores output lines", async () => {
    mockCaptureOutput.mockImplementation(() => Promise.resolve("line 1\nline 2\nline 3"));

    let result: ReturnType<typeof useAgentOutput>;

    await createRoot(async (dispose) => {
      result = useAgentOutput({
        ticketId: "TEST-123",
        isRunning: true,
        captureOutput: mockCaptureOutput,
      });
      await result.refresh();
      dispose();
    });

    expect(result!.lines()).toEqual(["line 1", "line 2", "line 3"]);
  });

  test("filters empty lines from output", async () => {
    mockCaptureOutput.mockImplementation(() => Promise.resolve("line 1\n\n\nline 2\n\n"));

    let result: ReturnType<typeof useAgentOutput>;

    await createRoot(async (dispose) => {
      result = useAgentOutput({
        ticketId: "TEST-123",
        isRunning: true,
        captureOutput: mockCaptureOutput,
      });
      await result.refresh();
      dispose();
    });

    expect(result!.lines()).toEqual(["line 1", "line 2"]);
  });

  test("handles error during capture gracefully", async () => {
    mockCaptureOutput.mockImplementation(() => Promise.reject(new Error("Capture failed")));

    let result: ReturnType<typeof useAgentOutput>;

    await createRoot(async (dispose) => {
      result = useAgentOutput({
        ticketId: "TEST-123",
        isRunning: true,
        captureOutput: mockCaptureOutput,
      });
      // Should not throw - error is caught internally
      try {
        await result.refresh();
      } catch {
        // Expected - error may propagate in test environment
      }
      dispose();
    });

    // Should still have empty output after error
    expect(result!.lines()).toEqual([]);
    expect(result!.error()).toBeInstanceOf(Error);
  });

  test("does not capture when agent is not running", async () => {
    mockCaptureOutput.mockImplementation(() => Promise.resolve("should not see this"));

    let result: ReturnType<typeof useAgentOutput>;

    await createRoot(async (dispose) => {
      result = useAgentOutput({
        ticketId: "TEST-123",
        isRunning: false,
        captureOutput: mockCaptureOutput,
      });
      await result.refresh();
      dispose();
    });

    expect(result!.lines()).toEqual([]);
  });

  test("handles null captured output", async () => {
    mockCaptureOutput.mockImplementation(() => Promise.resolve(null));

    let result: ReturnType<typeof useAgentOutput>;

    await createRoot(async (dispose) => {
      result = useAgentOutput({
        ticketId: "TEST-123",
        isRunning: true,
        captureOutput: mockCaptureOutput,
      });
      await result.refresh();
      dispose();
    });

    expect(result!.lines()).toEqual([]);
  });

  test("uses default pollInterval", () => {
    let result: ReturnType<typeof useAgentOutput>;

    createRoot((dispose) => {
      result = useAgentOutput({
        ticketId: "TEST-123",
        isRunning: false,
        captureOutput: mockCaptureOutput,
      });
      dispose();
    });

    // Hook should be created without error
    expect(result!).toBeDefined();
  });

  test("uses default maxLines when not specified", async () => {
    // Create more lines than default maxLines (100)
    const manyLines = Array.from({ length: 150 }, (_, i) => `Line ${i}`).join("\n");
    mockCaptureOutput.mockImplementation(() => Promise.resolve(manyLines));

    let result: ReturnType<typeof useAgentOutput>;

    await createRoot(async (dispose) => {
      result = useAgentOutput({
        ticketId: "TEST-123",
        isRunning: true,
        captureOutput: mockCaptureOutput,
      });
      await result.refresh();
      dispose();
    });

    // Default maxLines is 100
    expect(result!.lines().length).toBe(100);
  });
});
