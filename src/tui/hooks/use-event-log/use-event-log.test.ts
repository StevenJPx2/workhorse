/**
 * Tests for useEventLog hook
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createRoot } from "solid-js";
import { useEventLog } from "./use-event-log.ts";
import type { TicketEvent } from "#types/ticket.ts";

// Mock db events functions
const mockGetTicketEvents = mock<() => TicketEvent[]>(() => []);
const mockInsertTicketEvent = mock<
  (event: { ticket_id: string; event_type: string; payload: object }) => TicketEvent
>((event) => ({
  id: 1,
  ticket_id: event.ticket_id,
  event_type: event.event_type as TicketEvent["event_type"],
  payload: JSON.stringify(event.payload),
  timestamp: new Date().toISOString(),
}));

mock.module("#core/db/events.ts", () => ({
  getTicketEvents: mockGetTicketEvents,
  insertTicketEvent: mockInsertTicketEvent,
}));

function makeEvent(overrides: Partial<TicketEvent> = {}): TicketEvent {
  return {
    id: 1,
    ticket_id: "TEST-123",
    event_type: "status_change",
    payload: JSON.stringify({ from: "pending", to: "implementing" }),
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("useEventLog", () => {
  beforeEach(() => {
    mockGetTicketEvents.mockClear();
    mockInsertTicketEvent.mockClear();
    mockGetTicketEvents.mockImplementation(() => []);
    mockInsertTicketEvent.mockImplementation((event) => ({
      id: 1,
      ticket_id: event.ticket_id,
      event_type: event.event_type as TicketEvent["event_type"],
      payload: JSON.stringify(event.payload),
      timestamp: new Date().toISOString(),
    }));
  });

  it("should return initial empty state", () => {
    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123" });

      expect(result.events()).toEqual([]);
      expect(result.isLoading()).toBe(false);
      expect(result.error()).toBeNull();
      expect(result.count()).toBe(0);

      dispose();
    });
  });

  it("should load events on reload", () => {
    mockGetTicketEvents.mockImplementation(() => [
      makeEvent({ id: 1, event_type: "status_change" }),
      makeEvent({
        id: 2,
        event_type: "file_modified",
        payload: JSON.stringify({ path: "/file.ts" }),
      }),
    ]);

    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123" });

      result.reload();

      expect(mockGetTicketEvents).toHaveBeenCalled();
      expect(result.events()).toHaveLength(2);
      expect(result.count()).toBe(2);

      dispose();
    });
  });

  it("should not load without ticketId", () => {
    createRoot((dispose) => {
      const result = useEventLog({});

      result.reload();

      expect(mockGetTicketEvents).not.toHaveBeenCalled();

      dispose();
    });
  });

  it("should accept ticketId as function", () => {
    mockGetTicketEvents.mockImplementation(() => [makeEvent()]);

    createRoot((dispose) => {
      const result = useEventLog({ ticketId: () => "TEST-456" });

      result.reload();

      expect(mockGetTicketEvents).toHaveBeenCalledWith("TEST-456");

      dispose();
    });
  });

  it("should handle reload errors", () => {
    mockGetTicketEvents.mockImplementation(() => {
      throw new Error("DB error");
    });

    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123" });

      result.reload();

      expect(result.error()).toBeInstanceOf(Error);
      expect(result.isLoading()).toBe(false);

      dispose();
    });
  });

  it("should handle non-Error in reload", () => {
    mockGetTicketEvents.mockImplementation(() => {
      throw "string error";
    });

    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123" });

      result.reload();

      expect(result.error()?.message).toBe("string error");

      dispose();
    });
  });

  it("should parse JSON payload from events", () => {
    mockGetTicketEvents.mockImplementation(() => [
      makeEvent({ payload: JSON.stringify({ from: "pending", to: "done" }) }),
    ]);

    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123" });

      result.reload();

      expect(result.events()[0].payload).toEqual({ from: "pending", to: "done" });

      dispose();
    });
  });

  it("should handle malformed payload gracefully", () => {
    mockGetTicketEvents.mockImplementation(() => [makeEvent({ payload: "invalid json" })]);

    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123" });

      result.reload();

      expect(result.events()[0].payload).toEqual({ raw: "invalid json" });

      dispose();
    });
  });

  it("should respect maxEvents limit", () => {
    mockGetTicketEvents.mockImplementation(() =>
      Array.from({ length: 20 }, (_, i) => makeEvent({ id: i + 1 })),
    );

    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123", maxEvents: 5 });

      result.reload();

      expect(result.events()).toHaveLength(5);

      dispose();
    });
  });

  it("should log status change event", () => {
    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123" });

      const entry = result.logStatusChange({ from: "pending", to: "implementing" });

      expect(mockInsertTicketEvent).toHaveBeenCalledWith({
        ticket_id: "TEST-123",
        event_type: "status_change",
        payload: { from: "pending", to: "implementing" },
      });
      expect(entry.eventType).toBe("status_change");
      expect(entry.payload).toEqual({ from: "pending", to: "implementing" });

      dispose();
    });
  });

  it("should log file modified event", () => {
    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123" });

      const entry = result.logFileModified({ path: "/src/file.ts", additions: 10, deletions: 2 });

      expect(entry.eventType).toBe("file_modified");
      expect(entry.payload).toEqual({ path: "/src/file.ts", additions: 10, deletions: 2 });

      dispose();
    });
  });

  it("should log test result event", () => {
    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123" });

      const entry = result.logTestResult({ passed: 8, failed: 2, total: 10 });

      expect(entry.eventType).toBe("test_result");
      expect(entry.payload).toEqual({ passed: 8, failed: 2, total: 10 });

      dispose();
    });
  });

  it("should log agent started event", () => {
    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123" });

      const entry = result.logAgentStarted({ agent: "opencode", worktreePath: "/worktree" });

      expect(entry.eventType).toBe("agent_started");
      expect(entry.payload).toEqual({ agent: "opencode", worktreePath: "/worktree" });

      dispose();
    });
  });

  it("should log agent stopped event", () => {
    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123" });

      const entry = result.logAgentStopped({});

      expect(entry.eventType).toBe("agent_stopped");

      dispose();
    });
  });

  it("should log agent crashed event", () => {
    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123" });

      const entry = result.logAgentCrashed({ reason: "OOM" });

      expect(entry.eventType).toBe("agent_crashed");
      expect(entry.payload).toEqual({ reason: "OOM" });

      dispose();
    });
  });

  it("should log comment event", () => {
    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123" });

      const entry = result.logComment({ source: "user", content: "Hello" });

      expect(entry.eventType).toBe("comment");
      expect(entry.payload).toEqual({ source: "user", content: "Hello" });

      dispose();
    });
  });

  it("should log escalation event", () => {
    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123" });

      const entry = result.logEscalation(["Question 1?", "Question 2?"]);

      expect(entry.eventType).toBe("escalation");
      expect(entry.payload).toEqual({ questions: ["Question 1?", "Question 2?"] });

      dispose();
    });
  });

  it("should log custom event", () => {
    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123" });

      const entry = result.logCustom("notification", { content: "custom" });

      expect(entry.eventType).toBe("notification");

      dispose();
    });
  });

  it("should throw when logging without ticketId", () => {
    createRoot((dispose) => {
      const result = useEventLog({});

      expect(() => {
        result.logStatusChange({ from: "pending", to: "done" });
      }).toThrow("No ticket ID set");

      dispose();
    });
  });

  it("should add logged events to state", () => {
    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123" });

      result.logStatusChange({ from: "pending", to: "implementing" });
      result.logStatusChange({ from: "implementing", to: "done" });

      expect(result.events()).toHaveLength(2);
      expect(result.count()).toBe(2);

      dispose();
    });
  });

  it("should prepend new events to list", () => {
    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123" });

      result.logStatusChange({ from: "pending", to: "implementing" });
      result.logAgentStarted({ agent: "opencode", worktreePath: "/wt" });

      // Most recent event should be first
      expect(result.events()[0].eventType).toBe("agent_started");
      expect(result.events()[1].eventType).toBe("status_change");

      dispose();
    });
  });

  it("should filter events by type", () => {
    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123" });

      result.logStatusChange({ from: "pending", to: "implementing" });
      result.logFileModified({ path: "/file.ts", additions: 1, deletions: 0 });
      result.logStatusChange({ from: "implementing", to: "done" });

      const statusEvents = result.getEventsByType("status_change");
      expect(statusEvents).toHaveLength(2);

      const fileEvents = result.getEventsByType("file_modified");
      expect(fileEvents).toHaveLength(1);

      dispose();
    });
  });

  it("should get recent events", () => {
    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123" });

      result.logStatusChange({ from: "pending", to: "implementing" });
      result.logStatusChange({ from: "implementing", to: "done" });
      result.logStatusChange({ from: "done", to: "blocked" });

      const recent = result.getRecentEvents(2);
      expect(recent).toHaveLength(2);

      dispose();
    });
  });

  it("should auto-load when enabled", () => {
    mockGetTicketEvents.mockImplementation(() => [makeEvent()]);

    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123", autoLoad: true });

      expect(mockGetTicketEvents).toHaveBeenCalled();
      expect(result.events()).toHaveLength(1);

      dispose();
    });
  });

  it("should not auto-load without ticketId even if autoLoad is true", () => {
    createRoot((dispose) => {
      useEventLog({ autoLoad: true });

      expect(mockGetTicketEvents).not.toHaveBeenCalled();

      dispose();
    });
  });

  it("should set up polling when pollInterval given", () => {
    createRoot((dispose) => {
      const result = useEventLog({ ticketId: "TEST-123", pollInterval: 5000 });

      expect(result).toBeDefined();

      dispose();
    });
  });
});
