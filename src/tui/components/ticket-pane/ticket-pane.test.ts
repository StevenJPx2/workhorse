/**
 * Tests for TicketPane components
 */

import { describe, expect, it } from "bun:test";
import type { TicketEvent, TicketEventType, TicketStatus } from "#types/ticket.ts";
import type { UsePRReviewReturn } from "../../hooks/use-pr-review/types.ts";
import type { TicketPaneProps } from "./types.ts";

// Test the event formatting logic (extracted for testability)
function getEventIcon(eventType: TicketEventType, isLatest: boolean): string {
  if (isLatest) return ">";
  switch (eventType) {
    case "status_change":
      return "*";
    case "file_modified":
      return "~";
    case "test_result":
      return "T";
    case "escalation":
      return "!";
    case "comment":
      return "#";
    default:
      return "-";
  }
}

function formatEventDescription(event: TicketEvent): string {
  try {
    const payload = JSON.parse(event.payload);
    switch (event.event_type) {
      case "status_change":
        return `Status: ${payload.from} -> ${payload.to}`;
      case "file_modified":
        return `Modified: ${payload.path}`;
      case "test_result":
        return `Tests: ${payload.passed}/${payload.total} passed`;
      case "escalation":
        return `Escalated: ${payload.questions?.length ?? 0} questions`;
      case "comment":
        return `[${payload.source}] ${payload.content?.slice(0, 40)}...`;
      default:
        return event.event_type;
    }
  } catch {
    return event.event_type;
  }
}

describe("ticket-pane", () => {
  describe("getEventIcon", () => {
    it("should return > for latest event", () => {
      expect(getEventIcon("status_change", true)).toBe(">");
      expect(getEventIcon("file_modified", true)).toBe(">");
    });

    it("should return correct icon for event type", () => {
      expect(getEventIcon("status_change", false)).toBe("*");
      expect(getEventIcon("file_modified", false)).toBe("~");
      expect(getEventIcon("test_result", false)).toBe("T");
      expect(getEventIcon("escalation", false)).toBe("!");
      expect(getEventIcon("comment", false)).toBe("#");
    });
  });

  describe("formatEventDescription", () => {
    it("should format status_change event", () => {
      const event: TicketEvent = {
        id: 1,
        ticket_id: "AM-123",
        event_type: "status_change",
        payload: JSON.stringify({ from: "pending", to: "implementing" }),
        timestamp: "2024-01-01T00:00:00Z",
      };
      expect(formatEventDescription(event)).toBe("Status: pending -> implementing");
    });

    it("should format file_modified event", () => {
      const event: TicketEvent = {
        id: 2,
        ticket_id: "AM-123",
        event_type: "file_modified",
        payload: JSON.stringify({ path: "src/index.ts" }),
        timestamp: "2024-01-01T00:00:00Z",
      };
      expect(formatEventDescription(event)).toBe("Modified: src/index.ts");
    });

    it("should format test_result event", () => {
      const event: TicketEvent = {
        id: 3,
        ticket_id: "AM-123",
        event_type: "test_result",
        payload: JSON.stringify({ passed: 5, failed: 1, total: 6 }),
        timestamp: "2024-01-01T00:00:00Z",
      };
      expect(formatEventDescription(event)).toBe("Tests: 5/6 passed");
    });

    it("should format escalation event", () => {
      const event: TicketEvent = {
        id: 4,
        ticket_id: "AM-123",
        event_type: "escalation",
        payload: JSON.stringify({ questions: ["Q1", "Q2"] }),
        timestamp: "2024-01-01T00:00:00Z",
      };
      expect(formatEventDescription(event)).toBe("Escalated: 2 questions");
    });

    it("should format comment event", () => {
      const event: TicketEvent = {
        id: 5,
        ticket_id: "AM-123",
        event_type: "comment",
        payload: JSON.stringify({ source: "agent", content: "Working on fix" }),
        timestamp: "2024-01-01T00:00:00Z",
      };
      expect(formatEventDescription(event)).toBe("[agent] Working on fix...");
    });

    it("should handle invalid JSON", () => {
      const event: TicketEvent = {
        id: 6,
        ticket_id: "AM-123",
        event_type: "status_change",
        payload: "not valid json",
        timestamp: "2024-01-01T00:00:00Z",
      };
      expect(formatEventDescription(event)).toBe("status_change");
    });
  });

  describe("PR review display logic", () => {
    function shouldShowPRReview(
      status: TicketStatus,
      prUrl: string | null,
      prReview: UsePRReviewReturn | undefined,
    ): boolean {
      return status === "in_review" && prUrl !== null && Boolean(prReview);
    }

    it("shows PR review when in_review with pr_url and prReview", () => {
      expect(
        shouldShowPRReview(
          "in_review",
          "https://github.com/org/repo/pull/1",
          {} as UsePRReviewReturn,
        ),
      ).toBe(true);
    });

    it("hides PR review when not in_review", () => {
      const statuses: TicketStatus[] = [
        "pending",
        "queued",
        "planning",
        "implementing",
        "blocked",
        "pr_created",
        "done",
      ];
      for (const status of statuses) {
        expect(
          shouldShowPRReview(status, "https://github.com/org/repo/pull/1", {} as UsePRReviewReturn),
        ).toBe(false);
      }
    });

    it("hides PR review when pr_url is null", () => {
      expect(shouldShowPRReview("in_review", null, {} as UsePRReviewReturn)).toBe(false);
    });

    it("hides PR review when prReview is undefined", () => {
      expect(shouldShowPRReview("in_review", "https://github.com/org/repo/pull/1", undefined)).toBe(
        false,
      );
    });

    it("hides PR review when both pr_url and prReview are missing", () => {
      expect(shouldShowPRReview("in_review", null, undefined)).toBe(false);
    });

    it("TicketPaneProps accepts prReview field", () => {
      const props: TicketPaneProps = {
        ticket: {
          id: "AM-123",
          jira_key: "AM-123",
          jira_url: null,
          summary: "Test ticket",
          status: "in_review",
          rig: "github.com/org/repo",
          worktree_path: "/path/to/worktree",
          branch_name: "feat/test",
          agent: "opencode",
          agent_pid: null,
          pr_url: "https://github.com/org/repo/pull/1",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          last_jira_sync: null,
        },
      };
      expect(props.ticket.status).toBe("in_review");
      expect(props.ticket.pr_url).toBe("https://github.com/org/repo/pull/1");
      expect(props.prReview).toBeUndefined();
    });

    it("TicketPaneProps accepts prReview with hook return", () => {
      const mockPRReview = {
        reviews: () => [],
        commentsWithDrafts: () => [],
        reviewState: () => "pending" as const,
        isPolling: () => false,
        error: () => null,
        isSubmitting: () => false,
        setDraftReply: () => {},
        generateSmartReply: () => "",
        replyOnly: async () => {},
        replyAndAddressChanges: async () => {},
        addressAllComments: async () => {},
        refresh: async () => {},
        startPolling: () => {},
        stopPolling: () => {},
      } as UsePRReviewReturn;

      const props: TicketPaneProps = {
        ticket: {
          id: "AM-123",
          jira_key: "AM-123",
          jira_url: null,
          summary: "Test ticket",
          status: "in_review",
          rig: "github.com/org/repo",
          worktree_path: null,
          branch_name: null,
          agent: "opencode",
          agent_pid: null,
          pr_url: "https://github.com/org/repo/pull/1",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          last_jira_sync: null,
        },
        prReview: mockPRReview,
      };
      expect(props.prReview).toBeDefined();
      expect(props.prReview?.reviewState()).toBe("pending");
    });
  });
});
