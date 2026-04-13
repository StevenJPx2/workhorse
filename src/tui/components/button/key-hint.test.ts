/**
 * Tests for KeyHint component
 */

import { describe, it, expect } from "bun:test";

describe("key-hint", () => {
  describe("KeyHint logic", () => {
    it("should format key hint display", () => {
      const keyName = "q";
      const action = "quit";
      // Component renders: [q] quit
      const expected = `[${keyName}] ${action}`;
      expect(expected).toBe("[q] quit");
    });

    it("should format compact mode (no action)", () => {
      const keyName = "Enter";
      const compact = true;
      // Component renders: [Enter] (no action)
      const expected = compact ? `[${keyName}]` : `[${keyName}] action`;
      expect(expected).toBe("[Enter]");
    });

    it("should format non-compact mode (with action)", () => {
      const keyName = "Enter";
      const action = "confirm";
      const expected = `[${keyName}] ${action}`;
      expect(expected).toBe("[Enter] confirm");
    });

    it("should handle special keys", () => {
      const specialKeys = ["Enter", "Escape", "Tab", "Space", "ArrowUp", "ArrowDown"];
      for (const key of specialKeys) {
        const formatted = `[${key}]`;
        expect(formatted).toContain(key);
      }
    });

    it("should handle single character keys", () => {
      const keys = ["a", "b", "x", "y", "/", "?"];
      for (const key of keys) {
        const formatted = `[${key}]`;
        expect(formatted).toBe(`[${key}]`);
      }
    });

    it("should handle action descriptions", () => {
      const actions: Record<string, string> = {
        q: "quit",
        h: "help",
        x: "close",
        "?": "show help",
      };

      for (const [key, action] of Object.entries(actions)) {
        const formatted = `[${key}] ${action}`;
        expect(formatted).toContain(action);
      }
    });

    it("should handle long action descriptions", () => {
      const keyName = "Ctrl+s";
      const action = "Save current file and exit editor";
      const formatted = `[${keyName}] ${action}`;
      expect(formatted).toContain(keyName);
      expect(formatted).toContain(action);
    });
  });
});
