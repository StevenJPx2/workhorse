/**
 * Tests for theme utility functions
 */

import { describe, it, expect } from "bun:test";
import { getAgentColor, formatKeyHint, createDivider } from "./utils.ts";

describe("theme utils", () => {
  describe("getAgentColor", () => {
    it("should return claude color for claude agent", () => {
      const color = getAgentColor("claude");
      expect(typeof color).toBe("string");
      expect(color.length).toBeGreaterThan(0);
    });

    it("should return opencode color for opencode agent", () => {
      const color = getAgentColor("opencode");
      expect(typeof color).toBe("string");
    });

    it("should return opencode color for unknown agents", () => {
      const color = getAgentColor("unknown-agent");
      expect(typeof color).toBe("string");
    });

    it("should return opencode color for empty string", () => {
      const color = getAgentColor("");
      expect(typeof color).toBe("string");
    });

    it("should use theme when provided", () => {
      const mockTheme = {
        agent: {
          claude: "#ff0000",
          opencode: "#00ff00",
        },
      } as any;

      expect(getAgentColor("claude", mockTheme)).toBe("#ff0000");
      expect(getAgentColor("opencode", mockTheme)).toBe("#00ff00");
    });

    it("should fallback to default colors without theme", () => {
      const colorWithTheme = getAgentColor("claude", undefined);
      expect(typeof colorWithTheme).toBe("string");
    });
  });

  describe("formatKeyHint", () => {
    it("should format key and action", () => {
      expect(formatKeyHint("q", "quit")).toBe("[q] quit");
    });

    it("should format multi-char key", () => {
      expect(formatKeyHint("Enter", "submit")).toBe("[Enter] submit");
    });

    it("should format ctrl combo", () => {
      expect(formatKeyHint("Ctrl+s", "save")).toBe("[Ctrl+s] save");
    });

    it("should handle empty action", () => {
      expect(formatKeyHint("x", "")).toBe("[x] ");
    });

    it("should handle empty key", () => {
      expect(formatKeyHint("", "action")).toBe("[] action");
    });

    it("should format special characters", () => {
      expect(formatKeyHint("?", "help")).toBe("[?] help");
    });
  });

  describe("createDivider", () => {
    it("should create divider of given width", () => {
      const divider = createDivider(10);
      expect(divider).toBe("──────────");
      expect(divider.length).toBe(10);
    });

    it("should use custom character", () => {
      const divider = createDivider(5, "=");
      expect(divider).toBe("=====");
    });

    it("should create empty divider for width 0", () => {
      expect(createDivider(0)).toBe("");
    });

    it("should use default character ─", () => {
      const divider = createDivider(3);
      expect(divider).toBe("───");
    });

    it("should create single-char divider", () => {
      expect(createDivider(1)).toBe("─");
    });

    it("should handle dash character", () => {
      expect(createDivider(4, "-")).toBe("----");
    });
  });
});
