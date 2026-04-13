/**
 * Tests for Session Memory
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  getContextPath,
  readSessionMemory,
  writeSessionMemory,
  formatSessionMemory,
  createSessionMemory,
  addSessionEvent,
  addKeyDecision,
  updateSessionStatus,
  hasSessionMemory,
  type SessionEvent,
} from "../session-memory.ts";

describe("session-memory", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "jiratown-session-memory-test-"));
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("getContextPath", () => {
    test("returns correct path", () => {
      const path = getContextPath("/some/worktree");
      expect(path).toBe("/some/worktree/.jiratown/context.md");
    });
  });

  describe("createSessionMemory", () => {
    test("creates memory with required fields", () => {
      const memory = createSessionMemory("AM-123", "pending", "opencode", "feat/AM-123");

      expect(memory.ticketId).toBe("AM-123");
      expect(memory.status).toBe("pending");
      expect(memory.agent).toBe("opencode");
      expect(memory.branch).toBe("feat/AM-123");
      expect(memory.startedAt).toBeTruthy();
      expect(memory.lastUpdatedAt).toBeTruthy();
      expect(memory.recentActivity).toEqual([]);
      expect(memory.keyDecisions).toEqual([]);
    });

    test("uses default summary if not provided", () => {
      const memory = createSessionMemory("AM-123", "pending", "opencode", "feat/AM-123");
      expect(memory.summary).toBe("Starting work on AM-123");
    });

    test("uses custom summary if provided", () => {
      const memory = createSessionMemory(
        "AM-123",
        "pending",
        "opencode",
        "feat/AM-123",
        "Custom summary",
      );
      expect(memory.summary).toBe("Custom summary");
    });
  });

  describe("formatSessionMemory", () => {
    test("formats memory as markdown with frontmatter", () => {
      const memory = createSessionMemory("AM-123", "implementing", "opencode", "feat/AM-123");
      const formatted = formatSessionMemory(memory);

      expect(formatted).toContain("---");
      expect(formatted).toContain("ticket_id: AM-123");
      expect(formatted).toContain("status: implementing");
      expect(formatted).toContain("agent: opencode");
      expect(formatted).toContain("branch: feat/AM-123");
    });

    test("includes session summary section", () => {
      const memory = createSessionMemory("AM-123", "implementing", "opencode", "feat/AM-123");
      memory.summary = "Working on auth fix";
      const formatted = formatSessionMemory(memory);

      expect(formatted).toContain("## Session Summary");
      expect(formatted).toContain("Working on auth fix");
    });

    test("includes recent activity section", () => {
      const memory = createSessionMemory("AM-123", "implementing", "opencode", "feat/AM-123");
      memory.recentActivity = [
        { timestamp: "2025-01-01T10:00:00Z", type: "status_change", description: "Started work" },
      ];
      const formatted = formatSessionMemory(memory);

      expect(formatted).toContain("## Recent Activity");
      expect(formatted).toContain("[2025-01-01T10:00:00Z] Started work");
    });

    test("includes key decisions section", () => {
      const memory = createSessionMemory("AM-123", "implementing", "opencode", "feat/AM-123");
      memory.keyDecisions = ["Use exponential backoff", "Config via env var"];
      const formatted = formatSessionMemory(memory);

      expect(formatted).toContain("## Key Decisions");
      expect(formatted).toContain("- Use exponential backoff");
      expect(formatted).toContain("- Config via env var");
    });
  });

  describe("writeSessionMemory / readSessionMemory", () => {
    test("writes and reads session memory", () => {
      const memory = createSessionMemory("AM-123", "implementing", "opencode", "feat/AM-123");
      memory.summary = "Test summary";
      memory.recentActivity = [
        { timestamp: "2025-01-01T10:00:00Z", type: "status_change", description: "Event 1" },
      ];
      memory.keyDecisions = ["Decision 1"];

      const written = writeSessionMemory(tempDir, memory);
      expect(written).toBe(true);

      const read = readSessionMemory(tempDir);
      expect(read).not.toBeNull();
      expect(read?.ticketId).toBe("AM-123");
      expect(read?.status).toBe("implementing");
      expect(read?.agent).toBe("opencode");
      expect(read?.branch).toBe("feat/AM-123");
      expect(read?.summary).toBe("Test summary");
      expect(read?.keyDecisions).toContain("Decision 1");
    });

    test("creates .jiratown directory if missing", () => {
      const memory = createSessionMemory("AM-123", "pending", "opencode", "feat/AM-123");
      writeSessionMemory(tempDir, memory);

      expect(existsSync(join(tempDir, ".jiratown"))).toBe(true);
      expect(existsSync(join(tempDir, ".jiratown", "context.md"))).toBe(true);
    });

    test("returns null when no session memory exists", () => {
      const read = readSessionMemory(tempDir);
      expect(read).toBeNull();
    });
  });

  describe("hasSessionMemory", () => {
    test("returns false when no memory exists", () => {
      expect(hasSessionMemory(tempDir)).toBe(false);
    });

    test("returns true when memory exists", () => {
      const memory = createSessionMemory("AM-123", "pending", "opencode", "feat/AM-123");
      writeSessionMemory(tempDir, memory);
      expect(hasSessionMemory(tempDir)).toBe(true);
    });
  });

  describe("addSessionEvent", () => {
    test("adds event to existing memory", () => {
      const memory = createSessionMemory("AM-123", "pending", "opencode", "feat/AM-123");
      writeSessionMemory(tempDir, memory);

      const event: SessionEvent = {
        timestamp: new Date().toISOString(),
        type: "file_modified",
        description: "Modified auth.ts",
      };

      const added = addSessionEvent(tempDir, event);
      expect(added).toBe(true);

      const read = readSessionMemory(tempDir);
      expect(read?.recentActivity.length).toBe(1);
      expect(read?.recentActivity[0].description).toBe("Modified auth.ts");
    });

    test("returns false when no memory exists", () => {
      const event: SessionEvent = {
        timestamp: new Date().toISOString(),
        type: "file_modified",
        description: "Modified auth.ts",
      };

      const added = addSessionEvent(tempDir, event);
      expect(added).toBe(false);
    });

    test("trims events to max 20", () => {
      const memory = createSessionMemory("AM-123", "pending", "opencode", "feat/AM-123");
      // Add 25 events initially
      for (let i = 0; i < 25; i++) {
        memory.recentActivity.push({
          timestamp: `2025-01-01T10:${String(i).padStart(2, "0")}:00Z`,
          type: "agent_message",
          description: `Event ${i}`,
        });
      }
      writeSessionMemory(tempDir, memory);

      // Add another event
      addSessionEvent(tempDir, {
        timestamp: new Date().toISOString(),
        type: "file_modified",
        description: "New event",
      });

      const read = readSessionMemory(tempDir);
      expect(read?.recentActivity.length).toBe(20);
      expect(read?.recentActivity[0].description).toBe("New event");
    });
  });

  describe("addKeyDecision", () => {
    test("adds decision to existing memory", () => {
      const memory = createSessionMemory("AM-123", "pending", "opencode", "feat/AM-123");
      writeSessionMemory(tempDir, memory);

      const added = addKeyDecision(tempDir, "Use retry logic");
      expect(added).toBe(true);

      const read = readSessionMemory(tempDir);
      expect(read?.keyDecisions).toContain("Use retry logic");
    });

    test("returns false when no memory exists", () => {
      const added = addKeyDecision(tempDir, "Use retry logic");
      expect(added).toBe(false);
    });
  });

  describe("updateSessionStatus", () => {
    test("updates status and adds event", () => {
      const memory = createSessionMemory("AM-123", "pending", "opencode", "feat/AM-123");
      writeSessionMemory(tempDir, memory);

      const updated = updateSessionStatus(tempDir, "implementing");
      expect(updated).toBe(true);

      const read = readSessionMemory(tempDir);
      expect(read?.status).toBe("implementing");
      expect(read?.recentActivity[0].description).toContain("pending → implementing");
    });

    test("updates summary if provided", () => {
      const memory = createSessionMemory("AM-123", "pending", "opencode", "feat/AM-123");
      writeSessionMemory(tempDir, memory);

      updateSessionStatus(tempDir, "implementing", "Now implementing auth fix");

      const read = readSessionMemory(tempDir);
      expect(read?.summary).toBe("Now implementing auth fix");
    });

    test("returns false when no memory exists", () => {
      const updated = updateSessionStatus(tempDir, "implementing");
      expect(updated).toBe(false);
    });
  });
});
