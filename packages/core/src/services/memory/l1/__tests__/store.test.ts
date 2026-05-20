import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { L1Context } from "../context.ts";
import { L1Store } from "../store.ts";

const TEST_DIR = join(import.meta.dirname, ".test-store");
const WORKTREES_ROOT = join(TEST_DIR, "worktrees");
const WORKTREE_A = join(WORKTREES_ROOT, "AM-123");
const WORKHORSE_DIR = join(WORKTREE_A, ".workhorse");
const CONTEXT_FILE = join(WORKHORSE_DIR, "context.md");

describe("L1Store", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(WORKTREE_A, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it("scans worktrees root and finds existing contexts", async () => {
    // Create a context.md file first
    mkdirSync(WORKHORSE_DIR, { recursive: true });
    writeFileSync(CONTEXT_FILE, "# AM-123: Test Issue\n\n## Patterns\n\n## Sessions\n");

    const store = new L1Store(WORKTREES_ROOT);
    const ctx = store.get("AM-123");

    expect(ctx).toBeDefined();
    expect(ctx).toBeInstanceOf(L1Context);
    expect(ctx!.worktreePath).toBe(WORKTREE_A);
  });

  it("returns undefined for unknown issue", () => {
    const store = new L1Store(WORKTREES_ROOT);
    expect(store.get("UNKNOWN-999")).toBeUndefined();
  });

  it("handles non-existent worktrees root", () => {
    const store = new L1Store("/non/existent/path");
    expect(store.all().size).toBe(0);
  });

  it("register adds new context to map", () => {
    const store = new L1Store(WORKTREES_ROOT);
    const ctx = store.register("AM-456", join(WORKTREES_ROOT, "AM-456"));

    expect(ctx).toBeInstanceOf(L1Context);
    expect(store.get("AM-456")).toBe(ctx);
  });

  it("refresh re-scans worktrees root", async () => {
    const store = new L1Store(WORKTREES_ROOT);
    expect(store.all().size).toBe(0);

    // Create context.md after store construction
    mkdirSync(WORKHORSE_DIR, { recursive: true });
    writeFileSync(CONTEXT_FILE, "# AM-123: Test Issue\n\n## Patterns\n\n## Sessions\n");

    store.refresh();
    expect(store.get("AM-123")).toBeDefined();
  });

  it("all returns map of all contexts", async () => {
    // Create two worktrees
    const worktreeB = join(WORKTREES_ROOT, "AM-456");
    mkdirSync(WORKHORSE_DIR, { recursive: true });
    mkdirSync(join(worktreeB, ".workhorse"), { recursive: true });
    writeFileSync(CONTEXT_FILE, "# AM-123: Issue A\n\n## Patterns\n\n## Sessions\n");
    writeFileSync(
      join(worktreeB, ".workhorse/context.md"),
      "# AM-456: Issue B\n\n## Patterns\n\n## Sessions\n",
    );

    const store = new L1Store(WORKTREES_ROOT);
    const all = store.all();

    expect(all.size).toBe(2);
    expect(all.has("AM-123")).toBe(true);
    expect(all.has("AM-456")).toBe(true);
  });

  it("skips files (non-directories) in worktrees root", () => {
    // Create a file directly in worktrees root (not a directory)
    writeFileSync(join(WORKTREES_ROOT, "random-file.txt"), "not a worktree");

    // Also create a valid worktree
    mkdirSync(WORKHORSE_DIR, { recursive: true });
    writeFileSync(CONTEXT_FILE, "# AM-123: Test Issue\n\n## Patterns\n\n## Sessions\n");

    const store = new L1Store(WORKTREES_ROOT);

    // Should only find the valid worktree, skipping the file
    expect(store.all().size).toBe(1);
    expect(store.get("AM-123")).toBeDefined();
  });

  it("skips directories without context.md", () => {
    // Create a directory without context.md
    const emptyWorktree = join(WORKTREES_ROOT, "empty-worktree");
    mkdirSync(emptyWorktree, { recursive: true });

    // Also create a valid worktree
    mkdirSync(WORKHORSE_DIR, { recursive: true });
    writeFileSync(CONTEXT_FILE, "# AM-123: Test Issue\n\n## Patterns\n\n## Sessions\n");

    const store = new L1Store(WORKTREES_ROOT);

    // Should only find the valid worktree
    expect(store.all().size).toBe(1);
    expect(store.get("AM-123")).toBeDefined();
  });

  it("skips context.md without valid issue ID in title", () => {
    // Create context.md without issue ID in title
    const invalidWorktree = join(WORKTREES_ROOT, "invalid-title");
    mkdirSync(join(invalidWorktree, ".workhorse"), { recursive: true });
    writeFileSync(
      join(invalidWorktree, ".workhorse/context.md"),
      "# No Issue ID Here\n\n## Patterns\n\n## Sessions\n",
    );

    // Also create a valid worktree
    mkdirSync(WORKHORSE_DIR, { recursive: true });
    writeFileSync(CONTEXT_FILE, "# AM-123: Test Issue\n\n## Patterns\n\n## Sessions\n");

    const store = new L1Store(WORKTREES_ROOT);

    // Should only find the valid worktree with proper issue ID
    expect(store.all().size).toBe(1);
    expect(store.get("AM-123")).toBeDefined();
  });

  describe("multiple worktrees via register", () => {
    const worktreeA = join(WORKTREES_ROOT, "AM-100");
    const worktreeB = join(WORKTREES_ROOT, "AM-200");
    let store: L1Store;

    beforeEach(() => {
      store = new L1Store(WORKTREES_ROOT);
      mkdirSync(worktreeA, { recursive: true });
      mkdirSync(worktreeB, { recursive: true });
    });

    it("manages separate context.md files per worktree", async () => {
      const ctxA = store.register("AM-100", worktreeA);
      const ctxB = store.register("AM-200", worktreeB);

      await ctxA.create("AM-100: Issue A", "planning");
      await ctxB.create("AM-200: Issue B", "implementing");

      const memoryA = await ctxA.read();
      const memoryB = await ctxB.read();

      expect(memoryA!.title).toBe("AM-100: Issue A");
      expect(memoryA!.latestStatus).toBe("planning");
      expect(memoryB!.title).toBe("AM-200: Issue B");
      expect(memoryB!.latestStatus).toBe("implementing");
    });

    it("appends sessions to correct worktree", async () => {
      const ctxA = store.register("AM-100", worktreeA);
      const ctxB = store.register("AM-200", worktreeB);

      await ctxA.create("AM-100: Issue A", "planning");
      await ctxB.create("AM-200: Issue B", "planning");

      await ctxA.appendSession({
        timestamp: new Date(),
        status: "implementing",
        summary: ["Working on A"],
        learnings: [],
        filesChanged: [],
      });

      const memoryA = await ctxA.read();
      const memoryB = await ctxB.read();

      expect(memoryA!.sessions).toHaveLength(2);
      expect(memoryB!.sessions).toHaveLength(1);
    });
  });
});
