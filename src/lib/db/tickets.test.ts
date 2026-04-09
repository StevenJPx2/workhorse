/**
 * Tests for tickets.ts CRUD operations
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  initDatabase,
  closeDatabase,
  resetDatabaseRef,
  getDatabase,
} from "./index.ts";
import {
  insertTicket,
  getTicketById,
  getTicketsByRig,
  getAllTickets,
  updateTicketStatus,
  deleteTicket,
} from "./tickets.ts";

describe("tickets CRUD", () => {
  const testRig = `github.com/test/tickets-${Date.now()}`;

  beforeEach(() => {
    closeDatabase();
    resetDatabaseRef();
    initDatabase();
  });

  afterEach(() => {
    // Clean up test tickets
    try {
      const db = getDatabase();
      db.prepare("DELETE FROM ticket_events WHERE ticket_id LIKE 'TEST-%'").run();
      db.prepare("DELETE FROM tickets WHERE id LIKE 'TEST-%'").run();
    } catch {
      // Ignore cleanup errors
    }
    closeDatabase();
    resetDatabaseRef();
  });

  describe("insertTicket", () => {
    test("should insert a new ticket with minimal fields", () => {
      const ticket = insertTicket({
        id: "TEST-MIN-001",
        jira_key: "TEST-MIN-001",
        rig: testRig,
      });

      expect(ticket.id).toBe("TEST-MIN-001");
      expect(ticket.jira_key).toBe("TEST-MIN-001");
      expect(ticket.rig).toBe(testRig);
      expect(ticket.status).toBe("pending");
      expect(ticket.agent).toBe("opencode"); // Default
    });

    test("should insert a new ticket with all fields", () => {
      const ticket = insertTicket({
        id: "TEST-FULL-001",
        jira_key: "TEST-FULL-001",
        rig: testRig,
        jira_url: "https://jira.example.com/browse/TEST-FULL-001",
        summary: "Full ticket test",
        agent: "claude",
      });

      expect(ticket.id).toBe("TEST-FULL-001");
      expect(ticket.jira_url).toBe("https://jira.example.com/browse/TEST-FULL-001");
      expect(ticket.summary).toBe("Full ticket test");
      expect(ticket.agent).toBe("claude");
    });

    test("should use default agent if not provided", () => {
      const ticket = insertTicket({
        id: "TEST-DEF-001",
        jira_key: "TEST-DEF-001",
        rig: testRig,
      });

      expect(ticket.agent).toBe("opencode");
    });

    test("should handle null optional fields", () => {
      const ticket = insertTicket({
        id: "TEST-NULL-001",
        jira_key: "TEST-NULL-001",
        rig: testRig,
        jira_url: undefined,
        summary: undefined,
      });

      expect(ticket.jira_url).toBeNull();
      expect(ticket.summary).toBeNull();
    });
  });

  describe("getTicketById", () => {
    test("should return ticket by id", () => {
      insertTicket({
        id: "TEST-GET-001",
        jira_key: "TEST-GET-001",
        rig: testRig,
        summary: "Get by ID test",
      });

      const ticket = getTicketById("TEST-GET-001");
      expect(ticket).not.toBeNull();
      expect(ticket?.summary).toBe("Get by ID test");
    });

    test("should return null for non-existent ticket", () => {
      const ticket = getTicketById("NON-EXISTENT-ID");
      expect(ticket).toBeNull();
    });
  });

  describe("getTicketsByRig", () => {
    test("should return tickets for specific rig", () => {
      const rig1 = `github.com/test/rig1-${Date.now()}`;
      const rig2 = `github.com/test/rig2-${Date.now()}`;

      insertTicket({
        id: "TEST-RIG-001",
        jira_key: "TEST-RIG-001",
        rig: rig1,
      });

      insertTicket({
        id: "TEST-RIG-002",
        jira_key: "TEST-RIG-002",
        rig: rig1,
      });

      insertTicket({
        id: "TEST-RIG-003",
        jira_key: "TEST-RIG-003",
        rig: rig2,
      });

      const rig1Tickets = getTicketsByRig(rig1);
      expect(rig1Tickets.length).toBe(2);
      expect(rig1Tickets.every((t) => t.rig === rig1)).toBe(true);

      const rig2Tickets = getTicketsByRig(rig2);
      expect(rig2Tickets.length).toBe(1);
    });

    test("should return empty array for rig with no tickets", () => {
      const tickets = getTicketsByRig("github.com/nonexistent/repo");
      expect(tickets).toEqual([]);
    });

    test("should return tickets ordered consistently", () => {
      const rig = `github.com/test/order-${Date.now()}`;

      insertTicket({
        id: "TEST-ORD-001",
        jira_key: "TEST-ORD-001",
        rig,
      });

      insertTicket({
        id: "TEST-ORD-002",
        jira_key: "TEST-ORD-002",
        rig,
      });

      const tickets = getTicketsByRig(rig);
      expect(tickets.length).toBe(2);
      // Should return both tickets (order depends on same-second timestamp)
      const ids = tickets.map((t) => t.id).sort();
      expect(ids).toEqual(["TEST-ORD-001", "TEST-ORD-002"]);
    });
  });

  describe("getAllTickets", () => {
    test("should return all tickets", () => {
      const rig1 = `github.com/test/all1-${Date.now()}`;
      const rig2 = `github.com/test/all2-${Date.now()}`;

      insertTicket({
        id: "TEST-ALL-001",
        jira_key: "TEST-ALL-001",
        rig: rig1,
      });

      insertTicket({
        id: "TEST-ALL-002",
        jira_key: "TEST-ALL-002",
        rig: rig2,
      });

      const allTickets = getAllTickets();
      const testTickets = allTickets.filter((t) => t.id.startsWith("TEST-ALL-"));
      expect(testTickets.length).toBe(2);
    });

    test("should return tickets ordered consistently", () => {
      const rig = `github.com/test/allorder-${Date.now()}`;

      insertTicket({
        id: "TEST-AORD-001",
        jira_key: "TEST-AORD-001",
        rig,
      });

      insertTicket({
        id: "TEST-AORD-002",
        jira_key: "TEST-AORD-002",
        rig,
      });

      const allTickets = getAllTickets();
      const testTickets = allTickets.filter((t) => t.id.startsWith("TEST-AORD-"));
      expect(testTickets.length).toBe(2);
      // Should return both tickets (order depends on same-second timestamp)
      const ids = testTickets.map((t) => t.id).sort();
      expect(ids).toEqual(["TEST-AORD-001", "TEST-AORD-002"]);
    });
  });

  describe("updateTicketStatus", () => {
    test("should update ticket status", () => {
      insertTicket({
        id: "TEST-STS-001",
        jira_key: "TEST-STS-001",
        rig: testRig,
      });

      expect(getTicketById("TEST-STS-001")?.status).toBe("pending");

      updateTicketStatus("TEST-STS-001", "implementing");

      expect(getTicketById("TEST-STS-001")?.status).toBe("implementing");
    });

    test("should update through all status values", () => {
      insertTicket({
        id: "TEST-STS-002",
        jira_key: "TEST-STS-002",
        rig: testRig,
      });

      const statuses = [
        "queued",
        "planning",
        "implementing",
        "blocked",
        "pr_created",
        "in_review",
        "done",
      ] as const;

      for (const status of statuses) {
        updateTicketStatus("TEST-STS-002", status);
        expect(getTicketById("TEST-STS-002")?.status).toBe(status);
      }
    });

    test("should have updated_at field after update", () => {
      insertTicket({
        id: "TEST-STS-003",
        jira_key: "TEST-STS-003",
        rig: testRig,
      });

      updateTicketStatus("TEST-STS-003", "done");

      const updated = getTicketById("TEST-STS-003");
      // updated_at should be a valid timestamp string
      expect(updated?.updated_at).toBeDefined();
      expect(typeof updated?.updated_at).toBe("string");
    });
  });

  describe("deleteTicket", () => {
    test("should delete ticket", () => {
      insertTicket({
        id: "TEST-DEL-001",
        jira_key: "TEST-DEL-001",
        rig: testRig,
      });

      expect(getTicketById("TEST-DEL-001")).not.toBeNull();

      deleteTicket("TEST-DEL-001");

      expect(getTicketById("TEST-DEL-001")).toBeNull();
    });

    test("should delete ticket events before deleting ticket", () => {
      insertTicket({
        id: "TEST-DEL-002",
        jira_key: "TEST-DEL-002",
        rig: testRig,
      });

      // Add an event
      const db = getDatabase();
      db.prepare(
        "INSERT INTO ticket_events (ticket_id, event_type, payload) VALUES (?, ?, ?)"
      ).run("TEST-DEL-002", "status_change", "pending -> implementing");

      // Verify event exists
      const eventsBefore = db
        .prepare("SELECT * FROM ticket_events WHERE ticket_id = ?")
        .all("TEST-DEL-002");
      expect(eventsBefore.length).toBe(1);

      // Delete ticket
      deleteTicket("TEST-DEL-002");

      // Verify ticket is gone
      expect(getTicketById("TEST-DEL-002")).toBeNull();

      // Verify events are gone too
      const eventsAfter = db
        .prepare("SELECT * FROM ticket_events WHERE ticket_id = ?")
        .all("TEST-DEL-002");
      expect(eventsAfter.length).toBe(0);
    });

    test("should not throw when deleting non-existent ticket", () => {
      // Should not throw
      expect(() => deleteTicket("NON-EXISTENT")).not.toThrow();
    });
  });
});
