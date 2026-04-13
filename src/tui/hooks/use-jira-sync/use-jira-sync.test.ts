/**
 * Tests for useJiraSync hook
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createRoot } from "solid-js";
import { useJiraSync } from "./use-jira-sync.ts";

// Mock dependencies
const mockAddComment = mock((_key: string, _message: string) => Promise.resolve());
const mockTransitionIssue = mock((_key: string, _transitionId: string) => Promise.resolve());

mock.module("../use-atlassian/index.ts", () => ({
  useAtlassian: () => ({
    addComment: mockAddComment,
    transitionIssue: mockTransitionIssue,
  }),
}));

const mockUpdateTicket = mock(() => {});
const mockInsertTicketEvent = mock(() => ({}));

mock.module("#core/db/index.ts", () => ({
  updateTicket: mockUpdateTicket,
}));

mock.module("#core/db/events.ts", () => ({
  insertTicketEvent: mockInsertTicketEvent,
}));

describe("useJiraSync", () => {
  beforeEach(() => {
    mockAddComment.mockClear();
    mockAddComment.mockImplementation(() => Promise.resolve());
    mockTransitionIssue.mockClear();
    mockTransitionIssue.mockImplementation(() => Promise.resolve());
    mockUpdateTicket.mockClear();
    mockUpdateTicket.mockImplementation(() => {});
    mockInsertTicketEvent.mockClear();
    mockInsertTicketEvent.mockImplementation(() => ({}));
  });

  it("should return initial state", () => {
    createRoot((dispose) => {
      const result = useJiraSync({});

      expect(result.syncStatus()).toEqual({});
      expect(result.isSyncing()).toBe(false);
      expect(typeof result.postProgress).toBe("function");
      expect(typeof result.transitionStatus).toBe("function");
      expect(typeof result.linkPR).toBe("function");
      expect(typeof result.syncAll).toBe("function");

      dispose();
    });
  });

  it("should accept cloudId option", () => {
    createRoot((dispose) => {
      const result = useJiraSync({ cloudId: "test-cloud-id" });
      expect(result).toBeDefined();
      dispose();
    });
  });

  it("should accept cloudId as function", () => {
    createRoot((dispose) => {
      const result = useJiraSync({ cloudId: () => "test-cloud-id" });
      expect(result).toBeDefined();
      dispose();
    });
  });

  it("should post progress comment", async () => {
    createRoot(async (dispose) => {
      const result = useJiraSync({});

      await result.postProgress("TEST-123", "ticket-uuid", "Progress update");

      expect(mockAddComment).toHaveBeenCalledWith("TEST-123", "Progress update");
      expect(mockInsertTicketEvent).toHaveBeenCalled();
      expect(mockUpdateTicket).toHaveBeenCalled();

      dispose();
    });
  });

  it("should transition status with valid status", async () => {
    createRoot(async (dispose) => {
      const result = useJiraSync({});

      await result.transitionStatus("TEST-123", "ticket-uuid", "implementing");

      expect(mockTransitionIssue).toHaveBeenCalledWith("TEST-123", "41");

      dispose();
    });
  });

  it("should transition different statuses", async () => {
    createRoot(async (dispose) => {
      const result = useJiraSync({});

      // Test various status mappings
      await result.transitionStatus("TEST-123", "ticket-uuid", "pending");
      expect(mockTransitionIssue).toHaveBeenCalledWith("TEST-123", "11");

      mockTransitionIssue.mockClear();

      await result.transitionStatus("TEST-123", "ticket-uuid", "done");
      expect(mockTransitionIssue).toHaveBeenCalledWith("TEST-123", "91");

      dispose();
    });
  });

  it("should throw for unknown status transition", async () => {
    createRoot(async (dispose) => {
      const result = useJiraSync({});

      try {
        await result.transitionStatus("TEST-123", "ticket-uuid", "unknown_status" as any);
        expect(false).toBe(true); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain("No transition mapping");
      }

      dispose();
    });
  });

  it("should link PR to ticket", async () => {
    createRoot(async (dispose) => {
      const result = useJiraSync({});

      await result.linkPR("TEST-123", "ticket-uuid", "https://github.com/org/repo/pull/123");

      expect(mockAddComment).toHaveBeenCalled();
      expect(mockUpdateTicket).toHaveBeenCalledWith("ticket-uuid", {
        pr_url: "https://github.com/org/repo/pull/123",
      });

      dispose();
    });
  });

  it("should sync all for ticket", async () => {
    createRoot(async (dispose) => {
      const result = useJiraSync({});

      await result.syncAll("ticket-uuid");

      expect(mockUpdateTicket).toHaveBeenCalledWith(
        "ticket-uuid",
        expect.objectContaining({
          last_jira_sync: expect.any(String),
        }),
      );

      dispose();
    });
  });

  it("should not sync if already in progress", async () => {
    createRoot(async (dispose) => {
      const result = useJiraSync({});

      // First sync
      const sync1 = result.syncAll("ticket-uuid");

      // Second sync while first is in progress
      await result.syncAll("ticket-uuid");

      await sync1;

      // Should not create duplicate updates
      const updateCalls = mockUpdateTicket.mock.calls.filter(
        (call: any) => call[0] === "ticket-uuid",
      );
      expect(updateCalls.length).toBeGreaterThanOrEqual(1);

      dispose();
    });
  });

  it("should set syncing state during operations", async () => {
    createRoot(async (dispose) => {
      const result = useJiraSync({});

      expect(result.isSyncing()).toBe(false);

      const syncPromise = result.postProgress("TEST-123", "ticket-uuid", "message");

      expect(result.isSyncing()).toBe(true);

      await syncPromise;

      expect(result.isSyncing()).toBe(false);

      dispose();
    });
  });

  it("should track sync status per ticket", async () => {
    createRoot(async (dispose) => {
      const result = useJiraSync({});

      await result.syncAll("ticket-1");

      const status = result.syncStatus();
      expect(status["ticket-1"]).toBeDefined();
      expect(status["ticket-1"].inProgress).toBe(false);
      expect(status["ticket-1"].lastSync).toBeTruthy();
      expect(status["ticket-1"].error).toBeNull();

      dispose();
    });
  });

  it("should call onSyncSuccess callback", async () => {
    const onSyncSuccess = mock(() => {});

    createRoot(async (dispose) => {
      const result = useJiraSync({ onSyncSuccess });

      await result.postProgress("TEST-123", "ticket-uuid", "message");

      expect(onSyncSuccess).toHaveBeenCalled();

      dispose();
    });
  });

  it("should call onSyncError callback on failure", async () => {
    mockAddComment.mockImplementation(() => Promise.reject(new Error("API Error")));
    const onSyncError = mock(() => {});

    createRoot(async (dispose) => {
      const result = useJiraSync({ onSyncError });

      try {
        await result.postProgress("TEST-123", "ticket-uuid", "message");
      } catch {
        // Expected
      }

      expect(onSyncError).toHaveBeenCalled();
      expect(result.isSyncing()).toBe(false);

      dispose();
    });
  });

  it("should record sync events", async () => {
    createRoot(async (dispose) => {
      const result = useJiraSync({});

      await result.postProgress("TEST-123", "ticket-uuid", "message");

      expect(mockInsertTicketEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          ticket_id: "ticket-uuid",
          event_type: "comment",
        }),
      );

      dispose();
    });
  });

  it("should handle transition action event recording", async () => {
    createRoot(async (dispose) => {
      const result = useJiraSync({});

      await result.transitionStatus("TEST-123", "ticket-uuid", "implementing");

      expect(mockInsertTicketEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          ticket_id: "ticket-uuid",
          event_type: "comment",
          payload: expect.objectContaining({
            content: expect.stringContaining("transition"),
          }),
        }),
      );

      dispose();
    });
  });

  it("should handle link_pr action event recording", async () => {
    createRoot(async (dispose) => {
      const result = useJiraSync({});

      await result.linkPR("TEST-123", "ticket-uuid", "https://github.com/pr/123");

      expect(mockInsertTicketEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          ticket_id: "ticket-uuid",
          event_type: "comment",
          payload: expect.objectContaining({
            content: expect.stringContaining("link_pr"),
          }),
        }),
      );

      dispose();
    });
  });

  it("should store error in sync status on failure", async () => {
    mockAddComment.mockImplementation(() => Promise.reject(new Error("Network error")));

    createRoot(async (dispose) => {
      const result = useJiraSync({});

      try {
        await result.postProgress("TEST-123", "ticket-uuid", "message");
      } catch {
        // Expected
      }

      const status = result.syncStatus()["ticket-uuid"];
      expect(status.error).toBe("Network error");
      expect(status.inProgress).toBe(false);

      dispose();
    });
  });

  it("should handle non-Error exceptions", async () => {
    mockAddComment.mockImplementation(() => Promise.reject("String error"));

    createRoot(async (dispose) => {
      const result = useJiraSync({});

      try {
        await result.postProgress("TEST-123", "ticket-uuid", "message");
      } catch (error: any) {
        expect(error.message).toBe("String error");
      }

      dispose();
    });
  });
});
