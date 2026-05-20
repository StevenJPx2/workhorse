/**
 * PI tool renderer tests.
 */

import { describe, expect, it } from "vitest";

import { piToolRenderer } from "../renderers.ts";

describe("piToolRenderer", () => {
  describe("skips workhorse tools", () => {
    it("returns null for workhorse_memory_write", () => {
      const result = piToolRenderer({
        kind: "tool",
        tool: "workhorse_memory_write",
        args: { summary: ["test"], learnings: [], patterns: [] },
      });
      expect(result).toBeNull();
    });

    it("returns null for workhorse_memory_search", () => {
      const result = piToolRenderer({
        kind: "tool",
        tool: "workhorse_memory_search",
        args: { query: "test" },
      });
      expect(result).toBeNull();
    });

    it("returns null for workhorse_update_status", () => {
      const result = piToolRenderer({
        kind: "tool",
        tool: "workhorse_update_status",
        args: { status: "done" },
      });
      expect(result).toBeNull();
    });

    it("returns null for workhorse_acknowledge", () => {
      const result = piToolRenderer({
        kind: "tool",
        tool: "workhorse_acknowledge",
        args: {},
      });
      expect(result).toBeNull();
    });
  });

  describe("renders Pi SDK tools", () => {
    it("renders write tool with path", () => {
      const result = piToolRenderer({
        kind: "tool",
        tool: "write",
        args: { path: "src/app.ts", content: "..." },
      });
      expect(result).toEqual({
        icon: "📄",
        title: "create",
        subtitle: "src/app.ts",
        style: "inline",
        color: "success",
      });
    });

    it("renders read tool with path", () => {
      const result = piToolRenderer({
        kind: "tool",
        tool: "read",
        args: { path: "src/app.ts" },
      });
      expect(result).toEqual({
        icon: "📖",
        title: "read",
        subtitle: "src/app.ts",
        style: "inline",
        color: "info",
      });
    });

    it("renders edit tool with path", () => {
      const result = piToolRenderer({
        kind: "tool",
        tool: "edit",
        args: { filePath: "src/app.ts" },
      });
      expect(result).toEqual({
        icon: "✏️",
        title: "edit",
        subtitle: "src/app.ts",
        style: "inline",
        color: "warning",
      });
    });

    it("renders bash tool with description", () => {
      const result = piToolRenderer({
        kind: "tool",
        tool: "bash",
        args: { description: "Run tests", command: "bun test" },
      });
      expect(result).toEqual({
        icon: "$",
        title: "Run tests",
        style: "inline",
        color: "accent",
      });
    });

    it("renders grep tool with pattern", () => {
      const result = piToolRenderer({
        kind: "tool",
        tool: "grep",
        args: { pattern: "TODO" },
      });
      expect(result).toEqual({
        icon: "🔍",
        title: "grep",
        subtitle: "TODO",
        style: "inline",
        color: "info",
      });
    });

    it("renders glob tool with pattern", () => {
      const result = piToolRenderer({
        kind: "tool",
        tool: "glob",
        args: { pattern: "**/*.ts" },
      });
      expect(result).toEqual({
        icon: "📂",
        title: "glob",
        subtitle: "**/*.ts",
        style: "inline",
        color: "info",
      });
    });
  });

  describe("shortens long paths", () => {
    it("shows ? for empty path", () => {
      const result = piToolRenderer({
        kind: "tool",
        tool: "write",
        args: { content: "..." },
      });
      expect(result?.subtitle).toBe("?");
    });

    it("truncates long paths", () => {
      const result = piToolRenderer({
        kind: "tool",
        tool: "read",
        args: { path: "packages/core/src/plugins/builtin/tools/definitions/memory-write.ts" },
      });
      expect(result?.subtitle).toBe(".../definitions/memory-write.ts");
    });
  });

  describe("returns null for unknown tools", () => {
    it("returns null for notification input", () => {
      const result = piToolRenderer({
        kind: "notification",
        notification: { title: "test" },
      });
      expect(result).toBeNull();
    });

    it("returns null for unknown tool", () => {
      const result = piToolRenderer({
        kind: "tool",
        tool: "custom_tool",
        args: {},
      });
      expect(result).toBeNull();
    });
  });
});
