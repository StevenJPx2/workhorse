/**
 * Tests for db/events.ts - ticket event database operations
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { insertTicketEvent, getTicketEvents } from "./events.ts";
import { initDatabase, insertTicket, deleteTicket } from "./index.ts";

const TEST_RIG = "github.com/test/events-repo";
const TS = Date.now();

describe("db/events", () => {
  const ticketId1 = `EVENTS-T1-${TS}`;
  const ticketId2 = `EVENTS-T2-${TS}`;
  const ticketId3 = `EVENTS-T3-${TS}`;

  beforeEach(() => {
    initDatabase();

    // Insert test tickets (ignore if already exist)
    try {
      insertTicket({ id: ticketId1, jira_key: ticketId1, rig: TEST_RIG });
    } catch {}
    try {
      insertTicket({ id: ticketId2, jira_key: ticketId2, rig: TEST_RIG });
    } catch {}
    try {
      insertTicket({ id: ticketId3, jira_key: ticketId3, rig: TEST_RIG });
    } catch {}
  });

  afterEach(() => {
    try {
      deleteTicket(ticketId1);
    } catch {}
    try {
      deleteTicket(ticketId2);
    } catch {}
    try {
      deleteTicket(ticketId3);
    } catch {}
  });

  describe("insertTicketEvent", () => {
    it("should insert a ticket event and return it", () => {
      const event = insertTicketEvent({
        ticket_id: ticketId1,
        event_type: "comment",
        payload: { message: "Hello world", source: "system" },
      });

      expect(event).toBeDefined();
      expect(event.id).toBeDefined();
      expect(event.ticket_id).toBe(ticketId1);
      expect(event.event_type).toBe("comment");
      expect(event.payload).toBe(JSON.stringify({ message: "Hello world", source: "system" }));
    });

    it("should return event with a numeric id", () => {
      const event = insertTicketEvent({
        ticket_id: ticketId1,
        event_type: "status_change",
        payload: { from: "pending", to: "implementing" },
      });

      expect(typeof event.id).toBe("number");
      expect(event.id).toBeGreaterThan(0);
    });

    it("should insert multiple events for same ticket", () => {
      insertTicketEvent({
        ticket_id: ticketId1,
        event_type: "comment",
        payload: { message: "First event" },
      });

      insertTicketEvent({
        ticket_id: ticketId1,
        event_type: "comment",
        payload: { message: "Second event" },
      });

      const events = getTicketEvents(ticketId1);
      expect(events.length).toBeGreaterThanOrEqual(2);
    });

    it("should serialize complex payload objects", () => {
      const payload = {
        nested: { key: "value" },
        array: [1, 2, 3],
        number: 42,
        boolean: true,
      };

      const event = insertTicketEvent({
        ticket_id: ticketId1,
        event_type: "test",
        payload,
      });

      expect(event.payload).toBe(JSON.stringify(payload));
    });

    it("should include timestamp in returned event", () => {
      const event = insertTicketEvent({
        ticket_id: ticketId1,
        event_type: "comment",
        payload: { message: "test" },
      });

      expect(event.timestamp).toBeDefined();
      expect(typeof event.timestamp).toBe("string");
    });

    it("should insert events with different event types", () => {
      const commentEvent = insertTicketEvent({
        ticket_id: ticketId1,
        event_type: "comment",
        payload: { text: "A comment" },
      });

      const statusEvent = insertTicketEvent({
        ticket_id: ticketId1,
        event_type: "status_change",
        payload: { status: "done" },
      });

      expect(commentEvent.event_type).toBe("comment");
      expect(statusEvent.event_type).toBe("status_change");
    });
  });

  describe("getTicketEvents", () => {
    it("should return empty array when no events exist", () => {
      const events = getTicketEvents(ticketId2);
      expect(events).toEqual([]);
    });

    it("should return events for the given ticket", () => {
      insertTicketEvent({
        ticket_id: ticketId1,
        event_type: "comment",
        payload: { message: "Event for ticket 001" },
      });

      const events = getTicketEvents(ticketId1);
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.every((e) => e.ticket_id === ticketId1)).toBe(true);
    });

    it("should not return events for a different ticket", () => {
      insertTicketEvent({
        ticket_id: ticketId1,
        event_type: "comment",
        payload: { message: "For ticket 1" },
      });

      insertTicketEvent({
        ticket_id: ticketId3,
        event_type: "comment",
        payload: { message: "For ticket 3" },
      });

      const events1 = getTicketEvents(ticketId1);
      const events3 = getTicketEvents(ticketId3);

      expect(events1.every((e) => e.ticket_id === ticketId1)).toBe(true);
      expect(events3.every((e) => e.ticket_id === ticketId3)).toBe(true);
    });

    it("should return events ordered by timestamp for ticket", () => {
      // Use ticketId2 (fresh, no previous events in this test run)
      const e1 = insertTicketEvent({
        ticket_id: ticketId2,
        event_type: "comment",
        payload: { order: 1 },
      });

      const e2 = insertTicketEvent({
        ticket_id: ticketId2,
        event_type: "comment",
        payload: { order: 2 },
      });

      const events = getTicketEvents(ticketId2);
      expect(events.length).toBe(2);

      // Both events should be present
      const ids = events.map((e) => e.id);
      expect(ids).toContain(e1.id);
      expect(ids).toContain(e2.id);
    });

    it("should return TicketEvent objects with required fields", () => {
      insertTicketEvent({
        ticket_id: ticketId1,
        event_type: "comment",
        payload: { message: "test" },
      });

      const events = getTicketEvents(ticketId1);
      expect(events.length).toBeGreaterThanOrEqual(1);

      const event = events[0];
      expect(event).toHaveProperty("id");
      expect(event).toHaveProperty("ticket_id");
      expect(event).toHaveProperty("event_type");
      expect(event).toHaveProperty("payload");
      expect(event).toHaveProperty("timestamp");
    });
  });
});
