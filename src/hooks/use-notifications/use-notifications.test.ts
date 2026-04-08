/**
 * Tests for useNotifications hook
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initNotificationsTable } from "../../harness/notifications/notification-store.ts";

// Test the underlying store functions (hook tests require Solid.js runtime)
import {
  createNotification,
  getNotificationsByTicket,
  getUnreadNotifications,
  markNotificationRead,
  markNotificationAcknowledged,
  acknowledgeNotifications,
  deleteNotification,
} from "../../harness/notifications/notification-store.ts";

describe("notification store (used by useNotifications)", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initNotificationsTable(db);
  });

  afterEach(() => {
    db.close();
  });

  test("creates notification successfully", () => {
    const notif = createNotification(db, {
      ticket_id: "AM-123",
      source_type: "jira_comment",
      source_id: "comment-1",
      priority: "normal",
      summary: "New comment",
      content: "This is a comment",
      author: "John",
    });

    expect(notif).not.toBeNull();
    expect(notif!.ticket_id).toBe("AM-123");
    expect(notif!.summary).toBe("New comment");
    expect(notif!.status).toBe("unread");
  });

  test("deduplicates by source_type and source_id", () => {
    const first = createNotification(db, {
      ticket_id: "AM-123",
      source_type: "jira_comment",
      source_id: "comment-1",
      priority: "normal",
      summary: "First",
      content: "First content",
    });

    const second = createNotification(db, {
      ticket_id: "AM-123",
      source_type: "jira_comment",
      source_id: "comment-1",
      priority: "high",
      summary: "Second",
      content: "Second content",
    });

    expect(first).not.toBeNull();
    expect(second).toBeNull(); // Duplicate, should return null
  });

  test("gets notifications by ticket", () => {
    createNotification(db, {
      ticket_id: "AM-123",
      source_type: "jira_comment",
      source_id: "c1",
      priority: "normal",
      summary: "Comment 1",
      content: "Content 1",
    });

    createNotification(db, {
      ticket_id: "AM-123",
      source_type: "jira_comment",
      source_id: "c2",
      priority: "blocking",
      summary: "Comment 2",
      content: "Content 2",
    });

    createNotification(db, {
      ticket_id: "AM-456",
      source_type: "jira_comment",
      source_id: "c3",
      priority: "normal",
      summary: "Other ticket",
      content: "Content 3",
    });

    const notifs = getNotificationsByTicket(db, "AM-123");
    expect(notifs.length).toBe(2);

    // Should be ordered by priority (blocking first)
    expect(notifs[0].priority).toBe("blocking");
  });

  test("gets unread notifications", () => {
    const n1 = createNotification(db, {
      ticket_id: "AM-123",
      source_type: "jira_comment",
      source_id: "c1",
      priority: "normal",
      summary: "Comment 1",
      content: "Content 1",
    });

    createNotification(db, {
      ticket_id: "AM-123",
      source_type: "jira_comment",
      source_id: "c2",
      priority: "normal",
      summary: "Comment 2",
      content: "Content 2",
    });

    // Mark first as read
    markNotificationRead(db, n1!.id);

    const unread = getUnreadNotifications(db, "AM-123");
    expect(unread.length).toBe(1);
    expect(unread[0].summary).toBe("Comment 2");
  });

  test("marks notification as acknowledged", () => {
    const notif = createNotification(db, {
      ticket_id: "AM-123",
      source_type: "jira_comment",
      source_id: "c1",
      priority: "normal",
      summary: "Comment",
      content: "Content",
    });

    markNotificationAcknowledged(db, notif!.id);

    const all = getNotificationsByTicket(db, "AM-123");
    expect(all[0].status).toBe("acknowledged");
  });

  test("acknowledges multiple notifications", () => {
    const n1 = createNotification(db, {
      ticket_id: "AM-123",
      source_type: "jira_comment",
      source_id: "c1",
      priority: "normal",
      summary: "Comment 1",
      content: "Content 1",
    });

    const n2 = createNotification(db, {
      ticket_id: "AM-123",
      source_type: "jira_comment",
      source_id: "c2",
      priority: "normal",
      summary: "Comment 2",
      content: "Content 2",
    });

    acknowledgeNotifications(db, [n1!.id, n2!.id]);

    const all = getNotificationsByTicket(db, "AM-123");
    expect(all.every((n) => n.status === "acknowledged")).toBe(true);
  });

  test("deletes notification", () => {
    const notif = createNotification(db, {
      ticket_id: "AM-123",
      source_type: "jira_comment",
      source_id: "c1",
      priority: "normal",
      summary: "Comment",
      content: "Content",
    });

    deleteNotification(db, notif!.id);

    const all = getNotificationsByTicket(db, "AM-123");
    expect(all.length).toBe(0);
  });

  test("priority ordering: blocking > high > normal > low", () => {
    createNotification(db, {
      ticket_id: "AM-123",
      source_type: "system",
      source_id: "s1",
      priority: "low",
      summary: "Low",
      content: "",
    });

    createNotification(db, {
      ticket_id: "AM-123",
      source_type: "system",
      source_id: "s2",
      priority: "blocking",
      summary: "Blocking",
      content: "",
    });

    createNotification(db, {
      ticket_id: "AM-123",
      source_type: "system",
      source_id: "s3",
      priority: "normal",
      summary: "Normal",
      content: "",
    });

    createNotification(db, {
      ticket_id: "AM-123",
      source_type: "system",
      source_id: "s4",
      priority: "high",
      summary: "High",
      content: "",
    });

    const all = getNotificationsByTicket(db, "AM-123");
    expect(all.map((n) => n.priority)).toEqual([
      "blocking",
      "high",
      "normal",
      "low",
    ]);
  });
});
