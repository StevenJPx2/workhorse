/**
 * Tests for update-status tool handler
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { handleUpdateStatus } from "../update-status.ts";
import { initTicketsTable, insertTicket, getTicketById } from "./test-utils.ts";

describe("handleUpdateStatus", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initTicketsTable(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("when updating ticket status", () => {
    it("should update status and return previous/new status", () => {
      insertTicket(db, {
        id: "AM-123",
        jira_key: "AM-123",
        rig: "github.com/user/repo",
        status: "planning",
      });

      const result = handleUpdateStatus(db, "AM-123", {
        status: "implementing",
      });

      expect(result.success).toBe(true);
      expect(result.previous_status).toBe("planning");
      expect(result.new_status).toBe("implementing");
    });

    it("should persist the status change in database", () => {
      insertTicket(db, {
        id: "AM-123",
        jira_key: "AM-123",
        rig: "github.com/user/repo",
        status: "planning",
      });

      handleUpdateStatus(db, "AM-123", { status: "implementing" });

      const ticket = getTicketById(db, "AM-123");
      expect(ticket!.status).toBe("implementing");
    });

    it("should handle all valid status values", () => {
      // Note: pr_created is not included because it can only be set via jiratown_open_pr
      const statuses = [
        "pending",
        "queued",
        "planning",
        "implementing",
        "blocked",
        "testing",
        "in_review",
        "done",
      ] as const;

      for (const status of statuses) {
        const ticketId = `ticket-${status}`;
        insertTicket(db, {
          id: ticketId,
          jira_key: ticketId,
          rig: "github.com/user/repo",
          status: "pending",
        });

        const result = handleUpdateStatus(db, ticketId, { status });

        expect(result.success).toBe(true);
        expect(result.new_status).toBe(status);
      }
    });

    it("should return failure for non-existent ticket", () => {
      const result = handleUpdateStatus(db, "non-existent", {
        status: "implementing",
      });

      expect(result.success).toBe(false);
      expect(result.previous_status).toBe("");
      expect(result.new_status).toBe("");
    });
  });

  describe("with optional message", () => {
    it("should accept and process message (logged but not stored)", () => {
      insertTicket(db, {
        id: "AM-123",
        jira_key: "AM-123",
        rig: "github.com/user/repo",
        status: "planning",
      });

      // Message is for logging/context, not stored
      const result = handleUpdateStatus(db, "AM-123", {
        status: "implementing",
        message: "Starting implementation phase",
      });

      expect(result.success).toBe(true);
    });
  });
});
