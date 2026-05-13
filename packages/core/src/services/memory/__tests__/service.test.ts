import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import mitt from "mitt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Database } from "#db";
import type { HookEventMap } from "#lib/hooks";
import { MemoryService } from "../service.ts";

const TEST_DIR = join(import.meta.dirname, ".test-service");
const DB_PATH = join(TEST_DIR, "workhorse.db");
const MEMORY_DB_PATH = join(TEST_DIR, "memory.db");
const WORKTREES_ROOT = join(TEST_DIR, "worktrees");
const WORKTREE_PATH = join(WORKTREES_ROOT, "AM-123");

describe("MemoryService", () => {
  let db: Database;
  let hooks: ReturnType<typeof mitt<HookEventMap>>;
  let service: MemoryService | null = null;

  beforeEach(async () => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(WORKTREE_PATH, { recursive: true });

    db = await Database.create(DB_PATH);
    hooks = mitt<HookEventMap>();
  });

  afterEach(async () => {
    if (service) {
      await service.shutdown();
      service = null;
    }
    db.close();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("lifecycle", () => {
    it("creates successfully via static factory", async () => {
      service = await MemoryService.create({
        db,
        hooks,
        worktreesRoot: WORKTREES_ROOT,
        memoryDbPath: MEMORY_DB_PATH,
      });
      expect(service).toBeInstanceOf(MemoryService);
    });

    it("exposes l1, l2, and notifications", async () => {
      service = await MemoryService.create({
        db,
        hooks,
        worktreesRoot: WORKTREES_ROOT,
        memoryDbPath: MEMORY_DB_PATH,
      });
      expect(service.l1).toBeDefined();
      expect(service.l2).toBeDefined();
      expect(service.notifications).toBeDefined();
    });

    it("shuts down gracefully", async () => {
      service = await MemoryService.create({
        db,
        hooks,
        worktreesRoot: WORKTREES_ROOT,
        memoryDbPath: MEMORY_DB_PATH,
      });
      await service.shutdown();
      service = null;
    });
  });

  describe("L1: Session Memory", () => {
    beforeEach(async () => {
      service = await MemoryService.create({
        db,
        hooks,
        worktreesRoot: WORKTREES_ROOT,
        memoryDbPath: MEMORY_DB_PATH,
      });
    });

    it("l1.register() adds context for issue", () => {
      const ctx = service!.l1.register("AM-123", WORKTREE_PATH);
      expect(ctx.exists()).toBe(false);
      expect(service!.l1.get("AM-123")).toBe(ctx);
    });

    it("creates and reads session memory via context", async () => {
      const ctx = service!.l1.register("AM-123", WORKTREE_PATH);

      const memory = await ctx.create("AM-123: Test issue", "planning");

      expect(ctx.exists()).toBe(true);
      expect(memory.title).toBe("AM-123: Test issue");
      expect(memory.sessions).toHaveLength(1);
      expect(memory.sessions[0]!.status).toBe("planning");

      const read = await ctx.read();
      expect(read).not.toBeNull();
      expect(read!.title).toBe("AM-123: Test issue");
    });

    it("appends session entries via context", async () => {
      const ctx = service!.l1.register("AM-123", WORKTREE_PATH);
      await ctx.create("AM-123: Test issue", "planning");

      await ctx.appendSession({
        timestamp: new Date(),
        status: "implementing",
        summary: ["Started implementation"],
        learnings: ["Use drizzle for migrations"],
        filesChanged: ["src/db/schema.ts"],
      });

      const memory = await ctx.read();
      expect(memory!.sessions).toHaveLength(2);
      expect(memory!.latestStatus).toBe("implementing");
    });

    it("writes session memory via context", async () => {
      const ctx = service!.l1.register("AM-456", WORKTREE_PATH);

      await ctx.write({
        title: "AM-456: Different issue",
        patterns: ["Pattern A", "Pattern B"],
        sessions: [],
        latestStatus: "done",
      });

      const memory = await ctx.read();
      expect(memory!.title).toBe("AM-456: Different issue");
      expect(memory!.patterns).toEqual(["Pattern A", "Pattern B"]);
    });
  });

  describe("L2: Semantic Search", () => {
    beforeEach(async () => {
      service = await MemoryService.create({
        db,
        hooks,
        worktreesRoot: WORKTREES_ROOT,
        memoryDbPath: MEMORY_DB_PATH,
      });
    });

    it("indexes and searches documents", async () => {
      await service!.l2.index([
        {
          id: "doc-1",
          content: "Authentication uses JWT tokens for session management",
          metadata: { type: "decision", issueId: "AM-100" },
        },
      ]);

      const results = await service!.l2.search("JWT authentication");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.id).toBe("doc-1");
    });

    it("removes documents", async () => {
      await service!.l2.index([
        {
          id: "doc-to-remove",
          content: "This document will be removed",
          metadata: { type: "decision" },
        },
      ]);

      await service!.l2.remove(["doc-to-remove"]);

      const results = await service!.l2.search("removed", { limit: 10 });
      const ids = results.map((r) => r.id);
      expect(ids).not.toContain("doc-to-remove");
    });
  });

  describe("Notifications", () => {
    let issueId: string;

    beforeEach(async () => {
      service = await MemoryService.create({
        db,
        hooks,
        worktreesRoot: WORKTREES_ROOT,
        memoryDbPath: MEMORY_DB_PATH,
      });

      const issue = await db.issues.insert({
        externalId: "AM-123",
        source: "jira",
        title: "Test issue",
        description: "Test description",
        status: "planning",
        issueType: "task",
        url: "https://jira.example.com/AM-123",
        assignee: null,
        labels: [],
        metadata: {},
        worktreePath: null,
      });
      issueId = issue.id;
    });

    it("creates a notification", async () => {
      const notification = await service!.notifications.create({
        issueId,
        source: "jira",
        title: "New comment",
        body: "Please review the implementation",
      });

      expect(notification.id).toBeDefined();
      expect(notification.issueId).toBe(issueId);
      expect(notification.source).toBe("jira");
      expect(notification.title).toBe("New comment");
      expect(notification.status).toBe("unread");
    });

    it("emits notification.created hook", async () => {
      const handler = vi.fn();
      hooks.on("notification.created", handler);

      await service!.notifications.create({
        issueId,
        source: "jira",
        title: "Test notification",
        body: "Test body",
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          issueId,
          notification: expect.objectContaining({
            title: "Test notification",
          }),
        }),
      );
    });

    it("deduplicates by sourceId", async () => {
      const first = await service!.notifications.create({
        issueId,
        source: "jira",
        sourceId: "jira-comment-123",
        title: "First",
        body: "First body",
      });

      const second = await service!.notifications.create({
        issueId,
        source: "jira",
        sourceId: "jira-comment-123",
        title: "Second",
        body: "Second body",
      });

      expect(second.id).toBe(first.id);
      expect(second.title).toBe("First");
    });

    it("getUnread returns unread notifications", async () => {
      await service!.notifications.create({
        issueId,
        source: "jira",
        title: "Unread 1",
        body: "Body 1",
      });

      await service!.notifications.create({
        issueId,
        source: "github",
        title: "Unread 2",
        body: "Body 2",
      });

      const unread = await service!.notifications.getUnread(issueId);
      expect(unread).toHaveLength(2);
    });

    it("markRead updates notification status", async () => {
      const notification = await service!.notifications.create({
        issueId,
        source: "jira",
        title: "Test",
        body: "Test body",
      });

      await service!.notifications.markRead(notification.id);

      const unread = await service!.notifications.getUnread(issueId);
      expect(unread).toHaveLength(0);
    });

    it("acknowledge marks multiple notifications", async () => {
      const n1 = await service!.notifications.create({
        issueId,
        source: "jira",
        title: "Test 1",
        body: "Body 1",
      });

      const n2 = await service!.notifications.create({
        issueId,
        source: "github",
        title: "Test 2",
        body: "Body 2",
      });

      await service!.notifications.acknowledge([n1.id, n2.id]);

      const unread = await service!.notifications.getUnread(issueId);
      expect(unread).toHaveLength(0);
    });

    it("generateInbox returns XML", () => {
      const notifications = [
        {
          id: "notif-1",
          issueId,
          priority: "normal" as const,
          status: "unread" as const,
          source: "jira",
          sourceId: null,
          title: "Test",
          body: "Test body",
          createdAt: new Date(),
          readAt: null,
          acknowledgedAt: null,
          metadata: null,
        },
      ];

      const xml = service!.notifications.generateInbox(notifications);
      expect(xml).toContain("<system_inbox>");
      expect(xml).toContain('id="notif-1"');
    });
  });
});
