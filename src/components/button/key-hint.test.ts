/**
 * Tests for KeyHint component logic
 */

import { describe, test, expect } from "bun:test";

// Test the formatting logic for key hints
function formatKeyHint(keyName: string, action: string, compact: boolean): string {
  if (compact) {
    return `[${keyName}]`;
  }
  return `[${keyName}] ${action}`;
}

describe("key-hint", () => {
  describe("formatKeyHint", () => {
    test("should format standard key hint with action", () => {
      expect(formatKeyHint("q", "quit", false)).toBe("[q] quit");
    });

    test("should format compact key hint without action", () => {
      expect(formatKeyHint("Enter", "confirm", true)).toBe("[Enter]");
    });

    test("should handle special keys", () => {
      expect(formatKeyHint("Ctrl+C", "cancel", false)).toBe("[Ctrl+C] cancel");
      expect(formatKeyHint("Space", "toggle", false)).toBe("[Space] toggle");
      expect(formatKeyHint("Esc", "close", false)).toBe("[Esc] close");
    });

    test("should handle empty action in non-compact mode", () => {
      expect(formatKeyHint("x", "", false)).toBe("[x] ");
    });

    test("should handle long key names", () => {
      expect(formatKeyHint("Ctrl+Shift+Enter", "submit", false)).toBe("[Ctrl+Shift+Enter] submit");
    });

    test("should handle long action descriptions", () => {
      const action = "perform a very long action that spans multiple words";
      expect(formatKeyHint("k", action, false)).toBe(`[k] ${action}`);
    });
  });

  describe("common key hints", () => {
    const commonKeys = [
      { key: "q", action: "quit" },
      { key: "?", action: "help" },
      { key: "Enter", action: "select" },
      { key: "Esc", action: "cancel" },
      { key: "j", action: "down" },
      { key: "k", action: "up" },
      { key: "Tab", action: "next" },
    ];

    test.each(commonKeys)("should format %p correctly", ({ key, action }) => {
      const result = formatKeyHint(key, action, false);
      expect(result).toBe(`[${key}] ${action}`);
    });
  });

  describe("compact vs full mode", () => {
    test("compact mode should be shorter", () => {
      const compactResult = formatKeyHint("Enter", "confirm", true);
      const fullResult = formatKeyHint("Enter", "confirm", false);
      expect(compactResult.length).toBeLessThan(fullResult.length);
    });

    test("compact mode should not include action", () => {
      const result = formatKeyHint("Enter", "confirm", true);
      expect(result).not.toContain("confirm");
    });
  });
});
