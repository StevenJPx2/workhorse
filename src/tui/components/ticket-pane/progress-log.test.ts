/**
 * Tests for ProgressLog component logic
 */

import { describe, it, expect } from "bun:test";
import type { TicketEvent } from "#types/ticket.ts";

// Event icons mapping (mirrors component)
const EVENT_ICONS: Record<string, string> = {
  status_change: "*",
  file_modified: "~",
  test_result: "T",
  escalation: "!",
  comment: "#",
  agent_started: ">",
  agent_stopped: ".",
  agent_crashed: "!!",
  jira_sync: "@",
  notification: "^",
};

function getEventIcon(eventType: string, isLatest: boolean): string {
  if (isLatest) return ">";
  return EVENT_ICONS[eventType] ?? "-";
}

function formatPayload(eventType: string, payload: Record<string, unknown>): string {
  switch (eventType) {
    case "status_change":
      return `Status: ${payload.from} -> ${payload.to}`;
    case "file_modified":
      return `Modified: ${payload.path}`;
    case "test_result":
      return `Tests: ${payload.passed}/${payload.total} passed`;
    case "escalation":
      return `Escalated: ${(payload.questions as string[])?.length ?? 0} questions`;
    case "comment": {
      const content = String(payload.content ?? "").slice(0, 40);
      return `[${payload.source}] ${content}${(payload.content as string)?.length > 40 ? "..." : ""}`;
    }
    case "agent_started":
      return `Agent started: ${payload.agent}`;
    case "agent_stopped":
      return "Agent stopped";
    case "agent_crashed":
      return `Agent crashed: ${payload.reason ?? "unknown"}`;
    case "jira_sync":
      return `Jira sync: ${payload.action ?? "synced"}`;
    case "notification":
      return String(payload.content ?? "notification");
    default:
      return eventType;
  }
}

function formatRawEvent(event: TicketEvent, isLatest: boolean) {
  const icon = getEventIcon(event.event_type, isLatest);
  let description = "";

  try {
    const payload = JSON.parse(event.payload);
    description = formatPayload(event.event_type, payload);
  } catch {
    description = event.event_type;
  }

  return {
    icon,
    description,
    timestamp: event.timestamp,
    isCurrent: isLatest,
  };
}

function formatLogEntry(
  entry: { eventType: string; payload: Record<string, unknown>; timestamp: string },
  isLatest: boolean,
) {
  return {
    icon: getEventIcon(entry.eventType, isLatest),
    description: formatPayload(entry.eventType, entry.payload),
    timestamp: entry.timestamp,
    isCurrent: isLatest,
  };
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

describe("progress-log", () => {
  describe("getEventIcon", () => {
    it("should return > for latest event", () => {
      expect(getEventIcon("status_change", true)).toBe(">");
      expect(getEventIcon("file_modified", true)).toBe(">");
    });

    it("should return correct icon for event types", () => {
      expect(getEventIcon("status_change", false)).toBe("*");
      expect(getEventIcon("file_modified", false)).toBe("~");
      expect(getEventIcon("test_result", false)).toBe("T");
      expect(getEventIcon("escalation", false)).toBe("!");
      expect(getEventIcon("comment", false)).toBe("#");
      expect(getEventIcon("agent_started", false)).toBe(">");
      expect(getEventIcon("agent_stopped", false)).toBe(".");
      expect(getEventIcon("agent_crashed", false)).toBe("!!");
      expect(getEventIcon("jira_sync", false)).toBe("@");
      expect(getEventIcon("notification", false)).toBe("^");
    });

    it("should return - for unknown event types", () => {
      expect(getEventIcon("unknown_type", false)).toBe("-");
    });
  });

  describe("formatPayload", () => {
    it("should format status_change", () => {
      const result = formatPayload("status_change", { from: "open", to: "in_progress" });
      expect(result).toBe("Status: open -> in_progress");
    });

    it("should format file_modified", () => {
      const result = formatPayload("file_modified", { path: "/path/to/file.ts" });
      expect(result).toBe("Modified: /path/to/file.ts");
    });

    it("should format test_result", () => {
      const result = formatPayload("test_result", { passed: 8, total: 10 });
      expect(result).toBe("Tests: 8/10 passed");
    });

    it("should format escalation", () => {
      const result = formatPayload("escalation", { questions: ["What?", "Why?"] });
      expect(result).toBe("Escalated: 2 questions");
    });

    it("should format escalation with no questions", () => {
      const result = formatPayload("escalation", {});
      expect(result).toBe("Escalated: 0 questions");
    });

    it("should format comment", () => {
      const result = formatPayload("comment", { source: "user", content: "Hello world" });
      expect(result).toBe("[user] Hello world");
    });

    it("should format comment with long content", () => {
      const longContent = "a".repeat(50);
      const result = formatPayload("comment", { source: "agent", content: longContent });
      expect(result).toContain("...");
      // Result includes "[agent] " prefix (9 chars) + 40 chars content + "..." (3 chars) = 52
      expect(result.length).toBeLessThanOrEqual(55);
    });

    it("should format agent_started", () => {
      const result = formatPayload("agent_started", { agent: "opencode" });
      expect(result).toBe("Agent started: opencode");
    });

    it("should format agent_stopped", () => {
      const result = formatPayload("agent_stopped", {});
      expect(result).toBe("Agent stopped");
    });

    it("should format agent_crashed", () => {
      const result = formatPayload("agent_crashed", { reason: "Out of memory" });
      expect(result).toBe("Agent crashed: Out of memory");
    });

    it("should format agent_crashed without reason", () => {
      const result = formatPayload("agent_crashed", {});
      expect(result).toBe("Agent crashed: unknown");
    });

    it("should format jira_sync", () => {
      const result = formatPayload("jira_sync", { action: "comment_added" });
      expect(result).toBe("Jira sync: comment_added");
    });

    it("should format jira_sync without action", () => {
      const result = formatPayload("jira_sync", {});
      expect(result).toBe("Jira sync: synced");
    });

    it("should format notification", () => {
      const result = formatPayload("notification", { content: "New message" });
      expect(result).toBe("New message");
    });

    it("should format notification without content", () => {
      const result = formatPayload("notification", {});
      expect(result).toBe("notification");
    });

    it("should return event type for unknown", () => {
      const result = formatPayload("unknown_event", {});
      expect(result).toBe("unknown_event");
    });
  });

  describe("formatRawEvent", () => {
    it("should format raw event", () => {
      const event: TicketEvent = {
        id: 1,
        ticket_id: "TEST-123",
        event_type: "status_change",
        payload: JSON.stringify({ from: "open", to: "in_progress" }),
        timestamp: "2024-01-01T00:00:00Z",
      };

      const result = formatRawEvent(event, false);
      expect(result.icon).toBe("*");
      expect(result.description).toBe("Status: open -> in_progress");
      expect(result.isCurrent).toBe(false);
    });

    it("should handle latest event", () => {
      const event: TicketEvent = {
        id: 1,
        ticket_id: "TEST-123",
        event_type: "status_change",
        payload: JSON.stringify({}),
        timestamp: "2024-01-01T00:00:00Z",
      };

      const result = formatRawEvent(event, true);
      expect(result.icon).toBe(">");
      expect(result.isCurrent).toBe(true);
    });

    it("should handle malformed JSON", () => {
      const event: TicketEvent = {
        id: 1,
        ticket_id: "TEST-123",
        event_type: "status_change",
        payload: "invalid json",
        timestamp: "2024-01-01T00:00:00Z",
      };

      const result = formatRawEvent(event, false);
      expect(result.description).toBe("status_change");
    });
  });

  describe("formatLogEntry", () => {
    it("should format log entry", () => {
      const entry = {
        eventType: "file_modified",
        payload: { path: "/file.ts" },
        timestamp: "2024-01-01T00:00:00Z",
      };

      const result = formatLogEntry(entry, false);
      expect(result.icon).toBe("~");
      expect(result.description).toBe("Modified: /file.ts");
    });

    it("should format latest log entry", () => {
      const entry = {
        eventType: "agent_started",
        payload: { agent: "opencode" },
        timestamp: "2024-01-01T00:00:00Z",
      };

      const result = formatLogEntry(entry, true);
      expect(result.icon).toBe(">");
      expect(result.isCurrent).toBe(true);
    });
  });

  describe("formatTime", () => {
    it("should format ISO timestamp", () => {
      const result = formatTime("2024-01-01T12:30:45Z");
      expect(result).toContain("12");
      expect(result).toContain("30");
    });

    it("should handle invalid date gracefully", () => {
      const result = formatTime("invalid");
      // toLocaleTimeString may return "Invalid Date" instead of throwing
      expect(result === "" || result === "Invalid Date").toBe(true);
    });

    it("should handle different time formats", () => {
      const result = formatTime("2024-06-15T09:05:00Z");
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
