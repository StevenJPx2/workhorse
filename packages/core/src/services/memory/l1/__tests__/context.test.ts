import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { L1Context } from "../context.ts";

const TEST_DIR = join(import.meta.dirname, ".test-context");
const WORKTREES_ROOT = join(TEST_DIR, "worktrees");
const WORKTREE_A = join(WORKTREES_ROOT, "AM-123");
const WORKHORSE_DIR = join(WORKTREE_A, ".workhorse");
const CONTEXT_FILE = join(WORKHORSE_DIR, "context.md");

describe("L1Context", () => {
  let ctx: L1Context;

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(WORKTREE_A, { recursive: true });
    ctx = new L1Context(WORKTREE_A);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("exists", () => {
    it("returns false when file does not exist", () => {
      expect(ctx.exists()).toBe(false);
    });

    it("returns true when file exists", () => {
      mkdirSync(WORKHORSE_DIR, { recursive: true });
      writeFileSync(CONTEXT_FILE, "# Test");
      expect(ctx.exists()).toBe(true);
    });
  });

  describe("create", () => {
    it("creates new context.md with initial session", async () => {
      const memory = await ctx.create("AM-123: Test Issue", "planning");

      expect(ctx.exists()).toBe(true);
      expect(memory.title).toBe("AM-123: Test Issue");
      expect(memory.sessions).toHaveLength(1);
      expect(memory.sessions[0]!.status).toBe("planning");
      expect(memory.latestStatus).toBe("planning");
    });
  });

  describe("read", () => {
    it("returns null when file does not exist", async () => {
      const memory = await ctx.read();
      expect(memory).toBeNull();
    });

    it("parses existing context.md", async () => {
      await ctx.create("AM-123: Test Issue", "implementing");
      const memory = await ctx.read();

      expect(memory).not.toBeNull();
      expect(memory!.title).toBe("AM-123: Test Issue");
    });
  });

  describe("write", () => {
    it("creates directory and writes file", async () => {
      await ctx.write({
        title: "AM-123: Test",
        patterns: ["Pattern A"],
        sessions: [],
        latestStatus: "planning",
      });

      expect(ctx.exists()).toBe(true);
      const memory = await ctx.read();
      expect(memory!.title).toBe("AM-123: Test");
      expect(memory!.patterns).toEqual(["Pattern A"]);
    });

    it("overwrites existing file", async () => {
      await ctx.create("AM-123: Old", "planning");
      await ctx.write({
        title: "AM-456: New",
        patterns: [],
        sessions: [],
        latestStatus: "done",
      });

      const memory = await ctx.read();
      expect(memory!.title).toBe("AM-456: New");
    });
  });

  describe("appendSession", () => {
    it("appends session to existing context.md", async () => {
      await ctx.create("AM-123: Test Issue", "planning");

      await ctx.appendSession({
        timestamp: new Date("2025-07-15T12:00:00Z"),
        status: "implementing",
        summary: ["Started implementation"],
        learnings: [],
        filesChanged: [],
      });

      const memory = await ctx.read();
      expect(memory!.sessions).toHaveLength(2);
      expect(memory!.latestStatus).toBe("implementing");
    });

    it("throws when no context.md exists", async () => {
      await expect(
        ctx.appendSession({
          timestamp: new Date(),
          status: "implementing",
          summary: ["Test"],
          learnings: [],
          filesChanged: [],
        }),
      ).rejects.toThrow("No session memory found");
    });
  });

  describe("updatePatterns", () => {
    it("updates patterns in existing context.md", async () => {
      await ctx.create("AM-123: Test Issue", "planning");
      await ctx.updatePatterns(["Pattern A", "Pattern B"]);

      const memory = await ctx.read();
      expect(memory!.patterns).toEqual(["Pattern A", "Pattern B"]);
    });

    it("throws when no context.md exists", async () => {
      await expect(ctx.updatePatterns(["Pattern"])).rejects.toThrow("No session memory found");
    });
  });
});
