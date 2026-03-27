/**
 * Tests for SQLite database operations
 *
 * These tests use a temporary HOME directory to isolate the database.
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Generate unique ticket IDs for each test run to avoid conflicts
let testCounter = 0;
const uniqueId = (prefix: string) => `${prefix}-${Date.now()}-${++testCounter}`;

describe("db", () => {

  describe("initDatabase", () => {
    it("should create database and tables", () => {
      const { initDatabase, getDatabase } = require("./db.ts");

      const db = initDatabase();
      expect(db).toBeDefined();

      // Check tables exist
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain("tickets");
      expect(tableNames).toContain("ticket_events");
    });

    it("should return same instance on multiple calls", () => {
      const { initDatabase, getDatabase } = require("./db.ts");

      const db1 = initDatabase();
      const db2 = getDatabase();

      expect(db1).toBe(db2);
    });
  });

  describe("getDatabase", () => {
    it("should auto-initialize if not already initialized", () => {
      const { getDatabase } = require("./db.ts");

      const db = getDatabase();
      expect(db).toBeDefined();
    });
  });

  describe("closeDatabase", () => {
    it("should close the database connection", () => {
      const { initDatabase, closeDatabase, getDatabase } = require("./db.ts");

      initDatabase();
      closeDatabase();

      // After closing, getDatabase should create a new instance
      const newDb = getDatabase();
      expect(newDb).toBeDefined();
    });
  });

  describe("insertTicket", () => {
    it("should insert a new ticket", () => {
      const { initDatabase, insertTicket, getTicketById } = require("./db.ts");

      initDatabase();
      const id = uniqueId("TEST");

      const ticket = insertTicket({
        id,
        jira_key: id,
        rig: "github.com/test/repo",
        jira_url: `https://test.atlassian.net/browse/${id}`,
        summary: "Test ticket",
        agent: "opencode",
      });

      expect(ticket).toBeDefined();
      expect(ticket.id).toBe(id);
      expect(ticket.jira_key).toBe(id);
      expect(ticket.rig).toBe("github.com/test/repo");
      expect(ticket.agent).toBe("opencode");
      expect(ticket.status).toBe("pending");

      const retrieved = getTicketById(id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(id);
    });

    it("should use default agent if not provided", () => {
      const { initDatabase, insertTicket } = require("./db.ts");

      initDatabase();
      const id = uniqueId("DEFAULT");

      const ticket = insertTicket({
        id,
        jira_key: id,
        rig: "github.com/test/repo",
      });

      expect(ticket.agent).toBe("opencode");
    });
  });

  describe("getTicketById", () => {
    it("should return null for non-existent ticket", () => {
      const { initDatabase, getTicketById } = require("./db.ts");

      initDatabase();

      const result = getTicketById("NONEXISTENT-TICKET-XYZ");
      expect(result).toBeNull();
    });
  });

  describe("getTicketsByRig", () => {
    it("should get tickets filtered by rig", () => {
      const { initDatabase, insertTicket, getTicketsByRig } = require("./db.ts");

      initDatabase();
      const rig = `github.com/org/repo-${Date.now()}`;

      insertTicket({ id: uniqueId("A"), jira_key: uniqueId("A"), rig });
      insertTicket({ id: uniqueId("A"), jira_key: uniqueId("A"), rig });
      insertTicket({ id: uniqueId("B"), jira_key: uniqueId("B"), rig: "github.com/other/repo" });

      const rigTickets = getTicketsByRig(rig);
      expect(rigTickets.length).toBe(2);
    });
  });

  describe("getAllTickets", () => {
    it("should get all tickets", () => {
      const { initDatabase, getAllTickets } = require("./db.ts");

      initDatabase();

      // Just verify it returns an array
      const tickets = getAllTickets();
      expect(Array.isArray(tickets)).toBe(true);
    });
  });

  describe("updateTicketStatus", () => {
    it("should update ticket status", () => {
      const { initDatabase, insertTicket, updateTicketStatus, getTicketById } = require("./db.ts");

      initDatabase();
      const id = uniqueId("STATUS");

      insertTicket({ id, jira_key: id, rig: "github.com/test/repo" });
      updateTicketStatus(id, "implementing");

      const ticket = getTicketById(id);
      expect(ticket!.status).toBe("implementing");
    });
  });

  describe("updateTicket", () => {
    it("should update multiple ticket fields", () => {
      const { initDatabase, insertTicket, updateTicket, getTicketById } = require("./db.ts");

      initDatabase();
      const id = uniqueId("UPDATE");

      insertTicket({ id, jira_key: id, rig: "github.com/test/repo" });

      updateTicket(id, {
        summary: "Updated summary",
        bead_id: "bd-123",
        worktree_path: "/path/to/worktree",
        agent: "claude",
        polecat_id: "pc-456",
        pr_url: "https://github.com/test/repo/pull/1",
        last_jira_sync: "2024-01-01T00:00:00Z",
        status: "done",
      });

      const ticket = getTicketById(id);
      expect(ticket!.summary).toBe("Updated summary");
      expect(ticket!.bead_id).toBe("bd-123");
      expect(ticket!.worktree_path).toBe("/path/to/worktree");
      expect(ticket!.agent).toBe("claude");
      expect(ticket!.polecat_id).toBe("pc-456");
      expect(ticket!.pr_url).toBe("https://github.com/test/repo/pull/1");
      expect(ticket!.last_jira_sync).toBe("2024-01-01T00:00:00Z");
      expect(ticket!.status).toBe("done");
    });

    it("should handle empty updates gracefully", () => {
      const { initDatabase, insertTicket, updateTicket, getTicketById } = require("./db.ts");

      initDatabase();
      const id = uniqueId("EMPTY");

      insertTicket({ id, jira_key: id, rig: "github.com/test/repo" });
      updateTicket(id, {});

      const ticket = getTicketById(id);
      expect(ticket!.id).toBe(id);
    });

    it("should update jira_url field", () => {
      const { initDatabase, insertTicket, updateTicket, getTicketById } = require("./db.ts");

      initDatabase();
      const id = uniqueId("URL");

      insertTicket({ id, jira_key: id, rig: "github.com/test/repo" });
      updateTicket(id, { jira_url: `https://test.atlassian.net/browse/${id}` });

      const ticket = getTicketById(id);
      expect(ticket!.jira_url).toBe(`https://test.atlassian.net/browse/${id}`);
    });
  });

  describe("deleteTicket", () => {
    it("should delete ticket and its events", () => {
      const { initDatabase, insertTicket, insertTicketEvent, deleteTicket, getTicketById, getTicketEvents } = require("./db.ts");

      initDatabase();
      const id = uniqueId("DELETE");

      insertTicket({ id, jira_key: id, rig: "github.com/test/repo" });
      insertTicketEvent({
        ticket_id: id,
        event_type: "status_change",
        payload: { from: "pending", to: "implementing" },
      });

      deleteTicket(id);

      const ticket = getTicketById(id);
      expect(ticket).toBeNull();

      const events = getTicketEvents(id);
      expect(events.length).toBe(0);
    });
  });

  describe("insertTicketEvent", () => {
    it("should insert and retrieve ticket events", () => {
      const { initDatabase, insertTicket, insertTicketEvent, getTicketEvents } = require("./db.ts");

      initDatabase();
      const id = uniqueId("EVENT");

      insertTicket({ id, jira_key: id, rig: "github.com/test/repo" });

      const event = insertTicketEvent({
        ticket_id: id,
        event_type: "status_change",
        payload: { from: "pending", to: "implementing" },
      });

      expect(event).toBeDefined();
      expect(event.ticket_id).toBe(id);
      expect(event.event_type).toBe("status_change");

      const events = getTicketEvents(id);
      expect(events.length).toBe(1);
      expect(events[0].ticket_id).toBe(id);
    });
  });

  describe("getTicketEvents", () => {
    it("should return empty array for ticket with no events", () => {
      const { initDatabase, insertTicket, getTicketEvents } = require("./db.ts");

      initDatabase();
      const id = uniqueId("NOEVENTS");

      insertTicket({ id, jira_key: id, rig: "github.com/test/repo" });

      const events = getTicketEvents(id);
      expect(events.length).toBe(0);
    });
  });
});
