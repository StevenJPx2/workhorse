/**
 * Tests for escalate tool handler
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { handleEscalate } from "../escalate.ts";
import { initTicketsTable, insertTicket, getTicketById } from "./test-utils.ts";
import { initNotificationsTable, getNotificationsByTicket } from "../../../notifications/index.ts";

describe("handleEscalate", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initTicketsTable(db);
    initNotificationsTable(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("when escalating questions", () => {
    it("should create a system notification with questions", () => {
      insertTicket(db, {
        id: "AM-123",
        jira_key: "AM-123",
        rig: "github.com/user/repo",
        status: "implementing",
      });

      const result = handleEscalate(db, "AM-123", {
        questions: ["What is the expected timeout?", "Should we retry?"],
        context: "Working on authentication timeout issue",
        blocking: false,
      });

      expect(result.success).toBe(true);
      expect(result.notification_id).toBeTruthy();

      const notifications = getNotificationsByTicket(db, "AM-123");
      expect(notifications.length).toBe(1);
      expect(notifications[0].source_type).toBe("system");
      expect(notifications[0].content).toContain("What is the expected timeout?");
      expect(notifications[0].content).toContain("Should we retry?");
    });

    it("should set priority to blocking when blocking=true", () => {
      insertTicket(db, {
        id: "AM-123",
        jira_key: "AM-123",
        rig: "github.com/user/repo",
        status: "implementing",
      });

      handleEscalate(db, "AM-123", {
        questions: ["Critical question?"],
        context: "Blocked on this",
        blocking: true,
      });

      const notifications = getNotificationsByTicket(db, "AM-123");
      expect(notifications[0].priority).toBe("blocking");
    });

    it("should set priority to high when blocking=false", () => {
      insertTicket(db, {
        id: "AM-123",
        jira_key: "AM-123",
        rig: "github.com/user/repo",
        status: "implementing",
      });

      handleEscalate(db, "AM-123", {
        questions: ["Non-blocking question?"],
        context: "Would be nice to know",
        blocking: false,
      });

      const notifications = getNotificationsByTicket(db, "AM-123");
      expect(notifications[0].priority).toBe("high");
    });

    it("should update ticket status to blocked when blocking=true", () => {
      insertTicket(db, {
        id: "AM-123",
        jira_key: "AM-123",
        rig: "github.com/user/repo",
        status: "implementing",
      });

      handleEscalate(db, "AM-123", {
        questions: ["Blocking question?"],
        context: "Cannot continue",
        blocking: true,
      });

      const ticket = getTicketById(db, "AM-123");
      expect(ticket!.status).toBe("blocked");
    });

    it("should not change ticket status when blocking=false", () => {
      insertTicket(db, {
        id: "AM-123",
        jira_key: "AM-123",
        rig: "github.com/user/repo",
        status: "implementing",
      });

      handleEscalate(db, "AM-123", {
        questions: ["Non-blocking question?"],
        context: "Just curious",
        blocking: false,
      });

      const ticket = getTicketById(db, "AM-123");
      expect(ticket!.status).toBe("implementing");
    });

    it("should include context in notification content", () => {
      insertTicket(db, {
        id: "AM-123",
        jira_key: "AM-123",
        rig: "github.com/user/repo",
        status: "implementing",
      });

      handleEscalate(db, "AM-123", {
        questions: ["Question?"],
        context: "Working on retry logic in auth module",
        blocking: false,
      });

      const notifications = getNotificationsByTicket(db, "AM-123");
      expect(notifications[0].content).toContain("Working on retry logic in auth module");
    });

    it("should return failure for non-existent ticket", () => {
      const result = handleEscalate(db, "non-existent", {
        questions: ["Question?"],
        context: "Context",
        blocking: false,
      });

      expect(result.success).toBe(false);
    });
  });
});
