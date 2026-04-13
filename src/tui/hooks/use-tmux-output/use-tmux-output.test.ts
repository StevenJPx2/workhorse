/**
 * Tests for useTmuxOutput hook
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createRoot } from "solid-js";
import { useTmuxOutput } from "./use-tmux-output.ts";

// Mock the capturePane function
const mockCapturePane = mock<(sessionName: string) => Promise<string | null>>(() =>
  Promise.resolve(null),
);

mock.module("#core/session/tmux/index.ts", () => ({
  capturePane: mockCapturePane,
}));

describe("useTmuxOutput", () => {
  beforeEach(() => {
    mockCapturePane.mockClear();
    mockCapturePane.mockImplementation(() => Promise.resolve(null));
  });

  it("should return initial state when disabled", () => {
    createRoot((dispose) => {
      const result = useTmuxOutput({
        sessionName: "TEST-123",
        enabled: false,
      });

      expect(result.lines()).toEqual([]);
      expect(result.isPolling()).toBe(false);
      expect(result.lastUpdated()).toBeNull();
      expect(result.error()).toBeNull();

      dispose();
    });
  });

  it("should return initial state when no sessionName", () => {
    createRoot((dispose) => {
      const result = useTmuxOutput({
        sessionName: "",
        enabled: true,
      });

      expect(result.lines()).toEqual([]);
      expect(result.isPolling()).toBe(false);

      dispose();
    });
  });

  it("should start polling when enabled", async () => {
    mockCapturePane.mockImplementation(() => Promise.resolve("output line"));

    createRoot(async (dispose) => {
      const result = useTmuxOutput({
        sessionName: "TEST-123",
        enabled: true,
        pollInterval: 100,
      });

      // Wait for initial fetch
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(result.isPolling()).toBe(true);
      expect(mockCapturePane).toHaveBeenCalledWith("TEST-123");

      dispose();
    });
  });

  it("should capture and store output lines", async () => {
    mockCapturePane.mockImplementation(() => Promise.resolve("line 1\nline 2\nline 3"));

    createRoot(async (dispose) => {
      const result = useTmuxOutput({
        sessionName: "TEST-123",
        enabled: true,
        pollInterval: 100,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(result.lines()).toEqual(["line 1", "line 2", "line 3"]);
      expect(result.lastUpdated()).toBeTruthy();

      dispose();
    });
  });

  it("should filter empty lines", async () => {
    mockCapturePane.mockImplementation(() => Promise.resolve("line 1\n\n\n  \nline 2\n\n"));

    createRoot(async (dispose) => {
      const result = useTmuxOutput({
        sessionName: "TEST-123",
        enabled: true,
        pollInterval: 100,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(result.lines()).toEqual(["line 1", "line 2"]);

      dispose();
    });
  });

  it("should limit lines to maxLines", async () => {
    const manyLines = Array.from({ length: 100 }, (_, i) => `Line ${i}`).join("\n");
    mockCapturePane.mockImplementation(() => Promise.resolve(manyLines));

    createRoot(async (dispose) => {
      const result = useTmuxOutput({
        sessionName: "TEST-123",
        enabled: true,
        pollInterval: 100,
        maxLines: 10,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(result.lines()).toHaveLength(10);
      expect(result.lines()[0]).toBe("Line 90");
      expect(result.lines()[9]).toBe("Line 99");

      dispose();
    });
  });

  it("should handle null capture output", async () => {
    mockCapturePane.mockImplementation(() => Promise.resolve(null));

    createRoot(async (dispose) => {
      const result = useTmuxOutput({
        sessionName: "TEST-123",
        enabled: true,
        pollInterval: 100,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(result.lines()).toEqual([]);
      expect(result.lastUpdated()).toBeTruthy();

      dispose();
    });
  });

  it("should handle capture errors", async () => {
    mockCapturePane.mockImplementation(() => Promise.reject(new Error("Capture failed")));

    createRoot(async (dispose) => {
      const result = useTmuxOutput({
        sessionName: "TEST-123",
        enabled: true,
        pollInterval: 100,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(result.error()).toBe("Capture failed");
      expect(result.lines()).toEqual([]);

      dispose();
    });
  });

  it("should support manual refresh", async () => {
    mockCapturePane.mockImplementation(() => Promise.resolve("refreshed content"));

    createRoot(async (dispose) => {
      const result = useTmuxOutput({
        sessionName: "TEST-123",
        enabled: false,
      });

      // Manually refresh
      await result.refresh();

      expect(result.lines()).toEqual(["refreshed content"]);
      expect(mockCapturePane).toHaveBeenCalledWith("TEST-123");

      dispose();
    });
  });

  it("should use default maxLines", async () => {
    mockCapturePane.mockImplementation(() =>
      Promise.resolve(Array.from({ length: 60 }, (_, i) => `Line ${i}`).join("\n")),
    );

    createRoot(async (dispose) => {
      const result = useTmuxOutput({
        sessionName: "TEST-123",
        enabled: true,
        pollInterval: 100,
        // maxLines defaults to 50
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(result.lines().length).toBeLessThanOrEqual(50);

      dispose();
    });
  });

  it("should use default pollInterval", async () => {
    mockCapturePane.mockImplementation(() => Promise.resolve("content"));

    createRoot(async (dispose) => {
      const result = useTmuxOutput({
        sessionName: "TEST-123",
        enabled: true,
        // pollInterval defaults to 2000
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(result.isPolling()).toBe(true);

      dispose();
    });
  });

  it("should update lines on subsequent polls", async () => {
    let callCount = 0;
    mockCapturePane.mockImplementation(() => {
      callCount++;
      return Promise.resolve(`Poll ${callCount}`);
    });

    createRoot(async (dispose) => {
      const result = useTmuxOutput({
        sessionName: "TEST-123",
        enabled: true,
        pollInterval: 50,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(result.lines()).toEqual(["Poll 1"]);

      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(result.lines()).toEqual(["Poll 2"]);

      dispose();
    });
  });

  it("should clear previous timer when re-enabling", async () => {
    mockCapturePane.mockImplementation(() => Promise.resolve("content"));

    let enabled = true;

    createRoot(async (dispose) => {
      useTmuxOutput({
        sessionName: "TEST-123",
        enabled,
        pollInterval: 100,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Disable and re-enable to trigger timer clearing
      enabled = false;

      dispose();
    });
  });
});
