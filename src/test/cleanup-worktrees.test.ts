/**
 * Tests for the test cleanup utility
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { isTestWorktree, trackTestWorktree, clearTrackedWorktrees } from "./cleanup-worktrees.ts";

describe("cleanup-worktrees utility", () => {
  beforeEach(() => {
    clearTrackedWorktrees();
  });

  describe("isTestWorktree", () => {
    test("matches TEST- prefix", () => {
      expect(isTestWorktree("TEST-123")).toBe(true);
      expect(isTestWorktree("test-456")).toBe(true);
      expect(isTestWorktree("Test-789")).toBe(true);
    });

    test("matches -TEST pattern", () => {
      expect(isTestWorktree("PROJ-TEST")).toBe(true);
      expect(isTestWorktree("PROJ-TEST-123")).toBe(true);
      expect(isTestWorktree("proj-test")).toBe(true);
    });

    test("matches -FAIL pattern", () => {
      expect(isTestWorktree("WORKTREE-FAIL-123")).toBe(true);
      expect(isTestWorktree("PROJ-FAIL")).toBe(true);
      expect(isTestWorktree("spawn-fail")).toBe(true);
    });

    test("matches WORKTREE-FAIL prefix", () => {
      expect(isTestWorktree("WORKTREE-FAIL")).toBe(true);
      expect(isTestWorktree("WORKTREE-FAIL-456")).toBe(true);
    });

    test("matches MOCK- prefix", () => {
      expect(isTestWorktree("MOCK-123")).toBe(true);
      expect(isTestWorktree("mock-456")).toBe(true);
    });

    test("matches FAKE- prefix", () => {
      expect(isTestWorktree("FAKE-123")).toBe(true);
      expect(isTestWorktree("fake-456")).toBe(true);
    });

    test("matches SPAWN- prefix", () => {
      expect(isTestWorktree("SPAWN-123")).toBe(true);
      expect(isTestWorktree("SPAWN-FAIL-456")).toBe(true);
    });

    test("does not match normal ticket IDs", () => {
      expect(isTestWorktree("PROJ-123")).toBe(false);
      expect(isTestWorktree("ADEPT-37632")).toBe(false);
      expect(isTestWorktree("AM-456")).toBe(false);
      expect(isTestWorktree("JIRA-789")).toBe(false);
    });

    test("matches tracked worktrees", () => {
      expect(isTestWorktree("CUSTOM-TRACKED-123")).toBe(false);

      trackTestWorktree("CUSTOM-TRACKED-123");

      expect(isTestWorktree("CUSTOM-TRACKED-123")).toBe(true);
    });
  });

  describe("trackTestWorktree", () => {
    test("adds worktree to tracked set", () => {
      const ticketId = "MY-CUSTOM-TICKET";

      expect(isTestWorktree(ticketId)).toBe(false);

      trackTestWorktree(ticketId);

      expect(isTestWorktree(ticketId)).toBe(true);
    });

    test("can track multiple worktrees", () => {
      trackTestWorktree("TICKET-1");
      trackTestWorktree("TICKET-2");
      trackTestWorktree("TICKET-3");

      expect(isTestWorktree("TICKET-1")).toBe(true);
      expect(isTestWorktree("TICKET-2")).toBe(true);
      expect(isTestWorktree("TICKET-3")).toBe(true);
    });
  });

  describe("clearTrackedWorktrees", () => {
    test("clears all tracked worktrees", () => {
      trackTestWorktree("TICKET-1");
      trackTestWorktree("TICKET-2");

      expect(isTestWorktree("TICKET-1")).toBe(true);
      expect(isTestWorktree("TICKET-2")).toBe(true);

      clearTrackedWorktrees();

      expect(isTestWorktree("TICKET-1")).toBe(false);
      expect(isTestWorktree("TICKET-2")).toBe(false);
    });
  });
});
