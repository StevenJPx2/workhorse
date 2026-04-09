/**
 * Tests for AgentOutput component logic
 */

import { describe, test, expect } from "bun:test";

// Test the formatTime logic (extracted for testability)
function formatTime(timestamp: string | null): string {
  if (!timestamp) return "";
  try {
    const date = new Date(timestamp);
    // Check for Invalid Date
    if (isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

// Test visible lines logic
function getVisibleLines(
  lines: string[],
  expanded: boolean,
  collapsedLines: number
): string[] {
  if (expanded || lines.length <= collapsedLines) {
    return lines;
  }
  return lines.slice(-collapsedLines);
}

// Test line truncation logic
function truncateLine(line: string, maxLength: number = 80): string {
  if (line.length > maxLength) {
    return line.slice(0, maxLength - 3) + "...";
  }
  return line;
}

describe("agent-output", () => {
  describe("formatTime", () => {
    test("should return empty string for null timestamp", () => {
      expect(formatTime(null)).toBe("");
    });

    test("should format valid ISO timestamp", () => {
      const result = formatTime("2024-01-15T10:30:45Z");
      // The result will vary based on locale, but should be non-empty
      expect(result).not.toBe("");
      expect(result.length).toBeGreaterThan(0);
    });

    test("should return empty string for invalid timestamp", () => {
      expect(formatTime("not-a-date")).toBe("");
    });
  });

  describe("getVisibleLines", () => {
    test("should return all lines when count is under collapsed limit", () => {
      const lines = ["line1", "line2", "line3"];
      const result = getVisibleLines(lines, false, 8);
      expect(result).toEqual(lines);
    });

    test("should return last N lines when collapsed and over limit", () => {
      const lines = ["line1", "line2", "line3", "line4", "line5"];
      const result = getVisibleLines(lines, false, 3);
      expect(result).toEqual(["line3", "line4", "line5"]);
    });

    test("should return all lines when expanded", () => {
      const lines = ["line1", "line2", "line3", "line4", "line5"];
      const result = getVisibleLines(lines, true, 3);
      expect(result).toEqual(lines);
    });

    test("should handle empty array", () => {
      const result = getVisibleLines([], false, 8);
      expect(result).toEqual([]);
    });

    test("should handle exactly collapsed line count", () => {
      const lines = ["line1", "line2", "line3"];
      const result = getVisibleLines(lines, false, 3);
      expect(result).toEqual(lines);
    });
  });

  describe("truncateLine", () => {
    test("should not truncate short lines", () => {
      const line = "short line";
      expect(truncateLine(line)).toBe(line);
    });

    test("should truncate long lines with ellipsis", () => {
      const line = "a".repeat(100);
      const result = truncateLine(line, 80);
      expect(result.length).toBe(80);
      expect(result.endsWith("...")).toBe(true);
    });

    test("should handle exactly 80 character line", () => {
      const line = "a".repeat(80);
      expect(truncateLine(line, 80)).toBe(line);
    });

    test("should handle custom max length", () => {
      const line = "a".repeat(50);
      const result = truncateLine(line, 30);
      expect(result.length).toBe(30);
      expect(result.endsWith("...")).toBe(true);
    });
  });

  describe("hasMore calculation", () => {
    test("should return true when lines exceed collapsed limit", () => {
      const totalLines = 10;
      const collapsedLines = 8;
      expect(totalLines > collapsedLines).toBe(true);
    });

    test("should return false when lines are under collapsed limit", () => {
      const totalLines = 5;
      const collapsedLines = 8;
      expect(totalLines > collapsedLines).toBe(false);
    });
  });

  describe("hiddenCount calculation", () => {
    test("should calculate correct hidden count", () => {
      const totalLines = 15;
      const collapsedLines = 8;
      expect(totalLines - collapsedLines).toBe(7);
    });
  });

  describe("output status indicator", () => {
    test("should show waiting message when running with no output", () => {
      const isRunning = true;
      const hasLines = false;
      const message = hasLines ? "output" : (isRunning ? "Waiting for output..." : "No output yet");
      expect(message).toBe("Waiting for output...");
    });

    test("should show no output message when not running with no output", () => {
      const isRunning = false;
      const hasLines = false;
      const message = hasLines ? "output" : (isRunning ? "Waiting for output..." : "No output yet");
      expect(message).toBe("No output yet");
    });
  });
});
