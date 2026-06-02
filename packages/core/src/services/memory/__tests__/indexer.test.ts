import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "#db";
import type { HookEmitter } from "#lib";
import { createMockHooks } from "#test-helpers";

import { MemoryIndexer } from "../indexer";
import { L1Store } from "../l1/store.ts";
import { L2Store } from "../l2.ts";

const TEST_DIR = join(import.meta.dirname, ".test-indexer");
const DB_PATH = join(TEST_DIR, "memory.db");
const WORKTREES_ROOT = join(TEST_DIR, "worktrees");
const REPO_ROOT = join(TEST_DIR, "repo");

// Skip tests in CI — the HuggingFace model download is flaky
const isCI = process.env["CI"] === "true";

describe.skipIf(isCI)("MemoryIndexer", () => {
  let l1: L1Store;
  let l2: L2Store;
  let indexer: MemoryIndexer;
  let hooks: HookEmitter;
  let db: Database;

  beforeEach(async () => {
    // Clean up and create test directories
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(WORKTREES_ROOT, { recursive: true });
    mkdirSync(REPO_ROOT, { recursive: true });

    hooks = createMockHooks();
    db = {
      issues: { getByExternalId: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Database;
    l1 = new L1Store(WORKTREES_ROOT);
    l2 = await L2Store.create(DB_PATH);
    indexer = new MemoryIndexer(l1, l2, hooks, db);
  });

  afterEach(async () => {
    indexer.dispose();
    await l2.close();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("indexCodebaseIntelligence", () => {
    it("indexes README.md if present", async () => {
      writeFileSync(
        join(REPO_ROOT, "README.md"),
        "# My Project\n\nThis is a test project.",
      );

      const indexed = await indexer.indexCodebaseIntelligence(REPO_ROOT);

      expect(indexed).toBe(1);

      // Verify it's searchable
      const results = await l2.search("test project", { returnContent: true });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.id).toBe("codebase:README.md");
    });

    it("indexes multiple intelligence files", async () => {
      writeFileSync(join(REPO_ROOT, "README.md"), "# Project README");
      writeFileSync(
        join(REPO_ROOT, "ARCHITECTURE.md"),
        "# Architecture Overview",
      );

      const indexed = await indexer.indexCodebaseIntelligence(REPO_ROOT);

      expect(indexed).toBe(2);
    });

    it("skips files that do not exist", async () => {
      // No files created
      const indexed = await indexer.indexCodebaseIntelligence(REPO_ROOT);
      expect(indexed).toBe(0);
    });

    it("deduplicates - does not re-index already indexed files", async () => {
      writeFileSync(join(REPO_ROOT, "README.md"), "# Project README");

      // First indexing
      const firstIndexed = await indexer.indexCodebaseIntelligence(REPO_ROOT);
      expect(firstIndexed).toBe(1);

      // Second indexing should skip
      const secondIndexed = await indexer.indexCodebaseIntelligence(REPO_ROOT);
      expect(secondIndexed).toBe(0);
    });

    it("indexes files in docs/ subdirectory", async () => {
      mkdirSync(join(REPO_ROOT, "docs"), { recursive: true });
      writeFileSync(join(REPO_ROOT, "docs", "README.md"), "# Documentation");

      const indexed = await indexer.indexCodebaseIntelligence(REPO_ROOT);

      expect(indexed).toBe(1);
      await expect(
        l2.search("Documentation").then((r) => r[0]!.id),
      ).resolves.toBe("codebase:docs/README.md");
    });

    it("indexes nested README files in subdirectories", async () => {
      mkdirSync(join(REPO_ROOT, "packages", "core"), { recursive: true });
      writeFileSync(join(REPO_ROOT, "README.md"), "# Root README");
      writeFileSync(
        join(REPO_ROOT, "packages", "core", "README.md"),
        "# Core Package",
      );

      const indexed = await indexer.indexCodebaseIntelligence(REPO_ROOT);

      expect(indexed).toBe(2);
      const results = await l2.search("README", { returnContent: true });
      const ids = results.map((r) => r.id);
      expect(ids).toContain("codebase:README.md");
      expect(ids).toContain("codebase:packages/core/README.md");
    });

    it("excludes node_modules directory", async () => {
      mkdirSync(join(REPO_ROOT, "node_modules", "some-package"), {
        recursive: true,
      });
      writeFileSync(
        join(REPO_ROOT, "node_modules", "some-package", "README.md"),
        "# Package",
      );

      const indexed = await indexer.indexCodebaseIntelligence(REPO_ROOT);

      expect(indexed).toBe(0);
    });

    it("stores correct metadata for codebase files", async () => {
      writeFileSync(join(REPO_ROOT, "README.md"), "# Test");

      await indexer.indexCodebaseIntelligence(REPO_ROOT);

      const results = await l2.search("Test", { returnContent: true });
      expect(results[0]!.metadata).toMatchObject({
        type: "code_context",
        source: "codebase",
        filePath: "README.md",
        fileName: "README.md",
      });
    });
  });

  describe("session memory indexing (via hooks)", () => {
    it("indexes session memory on agent.stop.post hook", async () => {
      // Create a worktree with L1 context
      const issueId = "AM-123";
      const worktreePath = join(WORKTREES_ROOT, issueId);
      mkdirSync(join(worktreePath, ".workhorse"), { recursive: true });

      // Register and create L1 context
      const l1ctx = l1.register(issueId, worktreePath);
      await l1ctx.create("AM-123: Test feature", "implementing");
      await l1ctx.updatePatterns(["Uses TypeScript", "Has tests"]);
      await l1ctx.appendSession({
        timestamp: new Date(),
        status: "done",
        summary: ["Implemented the feature", "Added unit tests"],
        learnings: ["Learned about TypeScript generics"],
        filesChanged: ["src/feature.ts", "src/feature.test.ts"],
      });

      // Initialize indexer to set up hooks
      indexer.initialize();

      // Create mock adapter
      const mockAdapter = {
        issue: {
          id: "uuid-123",
          externalId: issueId,
        },
      };

      // Emit the hook
      await hooks.callHook("agent.stop.post", { adapter: mockAdapter as any });

      // Wait a bit for async indexing
      await new Promise((r) => setTimeout(r, 100));

      // Verify session was indexed
      const results = await l2.search("Test feature", { returnContent: true });
      expect(results.length).toBeGreaterThan(0);

      // Check that session summary was indexed
      const summaryResult = results.find(
        (r) => r.id === `session:${issueId}:summary`,
      );
      expect(summaryResult).toBeDefined();
      expect(summaryResult!.metadata?.type).toBe("session_memory");
      expect(summaryResult!.metadata?.externalId).toBe(issueId);
    });

    it("indexes patterns as code_context", async () => {
      const issueId = "AM-456";
      const worktreePath = join(WORKTREES_ROOT, issueId);
      mkdirSync(join(worktreePath, ".workhorse"), { recursive: true });

      const l1ctx = l1.register(issueId, worktreePath);
      await l1ctx.create("AM-456: Another feature", "planning");
      await l1ctx.updatePatterns(["Uses Zod validation", "Drizzle ORM for DB"]);

      indexer.initialize();

      await hooks.callHook("agent.stop.post", {
        adapter: {
          issue: { id: "uuid-456", externalId: issueId },
        } as any,
      });

      await new Promise((r) => setTimeout(r, 100));

      const results = await l2.search("Zod validation", {
        returnContent: true,
      });
      const patternResult = results.find(
        (r) => r.id === `session:${issueId}:patterns`,
      );
      expect(patternResult).toBeDefined();
      expect(patternResult!.metadata?.type).toBe("code_context");
    });

    it("indexes learnings as decisions", async () => {
      const issueId = "AM-789";
      const worktreePath = join(WORKTREES_ROOT, issueId);
      mkdirSync(join(worktreePath, ".workhorse"), { recursive: true });

      const l1ctx = l1.register(issueId, worktreePath);
      await l1ctx.create("AM-789: Learning feature", "implementing");
      await l1ctx.appendSession({
        timestamp: new Date(),
        status: "done",
        summary: ["Did some work"],
        learnings: ["Important discovery about async/await"],
        filesChanged: [],
      });

      indexer.initialize();

      await hooks.callHook("agent.stop.post", {
        adapter: {
          issue: { id: "uuid-789", externalId: issueId },
        } as any,
      });

      await new Promise((r) => setTimeout(r, 100));

      const results = await l2.search("async/await discovery", {
        returnContent: true,
      });
      const learningResult = results.find(
        (r) => r.id === `session:${issueId}:learnings`,
      );
      expect(learningResult).toBeDefined();
      expect(learningResult!.metadata?.type).toBe("decision");
    });

    it("does not index if no L1 context exists", async () => {
      indexer.initialize();

      // Mock adapter for non-existent issue
      await hooks.callHook("agent.stop.post", {
        adapter: {
          issue: { id: "uuid-999", externalId: "NONEXISTENT-999" },
        } as any,
      });

      await new Promise((r) => setTimeout(r, 100));

      // Should not throw and L2 should be empty for this issue
      const results = await l2.search("NONEXISTENT");
      expect(results.length).toBe(0);
    });
  });

  describe("idle indexing (via agent.idle hook)", () => {
    it("indexes session memory on agent.idle hook with debounce", async () => {
      vi.useFakeTimers();

      const issueId = "AM-IDLE";
      const internalId = "uuid-idle";
      const worktreePath = join(WORKTREES_ROOT, issueId);
      mkdirSync(join(worktreePath, ".workhorse"), { recursive: true });

      // Register and create L1 context
      const l1ctx = l1.register(issueId, worktreePath);
      await l1ctx.create("AM-IDLE: Idle test feature", "implementing");
      await l1ctx.updatePatterns(["Pattern from idle"]);

      // Mock db to return the issue
      vi.mocked(db.issues.getByExternalId).mockResolvedValue({
        id: internalId,
        externalId: issueId,
        source: "jira",
      } as any);

      // Initialize indexer to set up hooks
      indexer.initialize();

      // Emit the idle hook
      hooks.emit("agent.idle", {
        issueId,
        status: "implementing",
        source: "jira",
      });

      // Advance timers past the debounce window (5 seconds)
      await vi.advanceTimersByTimeAsync(5100);

      vi.useRealTimers();

      // Wait a bit for async indexing to complete
      await new Promise((r) => setTimeout(r, 100));

      // Verify session was indexed
      const results = await l2.search("Idle test feature", {
        returnContent: true,
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.metadata?.externalId).toBe(issueId);
    });

    it("does not index on idle if issue not found in db", async () => {
      vi.useFakeTimers();

      const issueId = "AM-NOTFOUND";
      const worktreePath = join(WORKTREES_ROOT, issueId);
      mkdirSync(join(worktreePath, ".workhorse"), { recursive: true });

      const l1ctx = l1.register(issueId, worktreePath);
      await l1ctx.create("AM-NOTFOUND: Test", "planning");

      // Mock db to return undefined (issue not found)
      vi.mocked(db.issues.getByExternalId).mockResolvedValue(undefined);

      indexer.initialize();

      hooks.emit("agent.idle", { issueId, status: "planning", source: "jira" });

      await vi.advanceTimersByTimeAsync(5100);
      vi.useRealTimers();
      await new Promise((r) => setTimeout(r, 100));

      // Should not have indexed anything
      const results = await l2.search("AM-NOTFOUND");
      expect(results.length).toBe(0);
    });

    it("debounces rapid idle events", async () => {
      const issueId = "AM-DEBOUNCE";
      const internalId = "uuid-debounce";
      const worktreePath = join(WORKTREES_ROOT, issueId);
      mkdirSync(join(worktreePath, ".workhorse"), { recursive: true });

      const l1ctx = l1.register(issueId, worktreePath);
      await l1ctx.create("AM-DEBOUNCE: Debounce test", "implementing");

      vi.mocked(db.issues.getByExternalId).mockResolvedValue({
        id: internalId,
        externalId: issueId,
        source: "jira",
      } as any);

      // Track index calls via hook emissions
      let indexCount = 0;
      hooks.on("memory.indexed", () => {
        indexCount++;
      });

      // Create indexer with very short debounce for testing
      const shortDebounceIndexer = new MemoryIndexer(l1, l2, hooks, db, {
        debounceMs: 50,
      });
      shortDebounceIndexer.initialize();

      // Emit multiple idle events rapidly (within debounce window)
      hooks.emit("agent.idle", {
        issueId,
        status: "implementing",
        source: "jira",
      });
      await new Promise((r) => setTimeout(r, 20));
      hooks.emit("agent.idle", {
        issueId,
        status: "implementing",
        source: "jira",
      });
      await new Promise((r) => setTimeout(r, 20));
      hooks.emit("agent.idle", {
        issueId,
        status: "implementing",
        source: "jira",
      });

      // Should not have indexed yet (still within debounce window)
      expect(indexCount).toBe(0);

      // Wait for debounce to fire
      await new Promise((r) => setTimeout(r, 100));

      // Should have indexed exactly once
      expect(indexCount).toBe(1);

      // Verify content was indexed
      const results = await l2.search("Debounce test", { returnContent: true });
      expect(results.length).toBeGreaterThan(0);

      shortDebounceIndexer.dispose();
    });
  });

  describe("dispose", () => {
    it("unsubscribes from hooks", async () => {
      indexer.initialize();

      // Create context
      const issueId = "AM-DISPOSE";
      const worktreePath = join(WORKTREES_ROOT, issueId);
      mkdirSync(join(worktreePath, ".workhorse"), { recursive: true });
      const l1ctx = l1.register(issueId, worktreePath);
      await l1ctx.create("AM-DISPOSE: Test", "planning");

      // Dispose
      indexer.dispose();

      // Emit hook - should not index since disposed
      await hooks.callHook("agent.stop.post", {
        adapter: {
          issue: { id: "uuid-dispose", externalId: issueId },
        } as any,
      });

      await new Promise((r) => setTimeout(r, 100));

      const results = await l2.search("AM-DISPOSE");
      expect(results.length).toBe(0);
    });
  });
});
