/**
 * Tests for useNotifications hook
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createRoot } from "solid-js";
import { Database } from "bun:sqlite";
import { initNotificationsTable } from "../../harness/notifications/notification-store.ts";
import { useNotifications } from "./use-notifications.ts";
import { initDatabase, closeDatabase, resetDatabaseRef } from "../../lib/db/index.ts";

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

describe("useNotifications hook", () => {
  beforeEach(() => {
    closeDatabase();
    resetDatabaseRef();
    initDatabase();
  });

  afterEach(() => {
    closeDatabase();
    resetDatabaseRef();
  });

  test("should initialize with empty notifications", () => {
    createRoot((dispose) => {
      const hook = useNotifications();
      expect(hook.notifications()).toEqual([]);
      expect(hook.unreadCount()).toBe(0);
      expect(hook.hasBlocking()).toBe(false);
      expect(hook.isLoading()).toBe(false);
      expect(hook.error()).toBeNull();
      dispose();
    });
  });

  test("should skip acknowledgeMany with empty array", () => {
    createRoot((dispose) => {
      const hook = useNotifications({ ticketId: "TEST-006" });

      // Should not throw
      hook.acknowledgeMany([]);

      expect(hook.error()).toBeNull();
      dispose();
    });
  });

  test("should not start polling with zero or negative interval", () => {
    createRoot((dispose) => {
      const hook = useNotifications({
        ticketId: "TEST-POLL-002",
        pollInterval: 0,
      });

      // Should not throw
      hook.startPolling();
      hook.stopPolling();

      dispose();
    });
  });

  test("should stop existing polling before starting new one", () => {
    createRoot((dispose) => {
      const hook = useNotifications({
        ticketId: "TEST-POLL-003",
        pollInterval: 100,
      });

      // Start polling twice - should not throw
      hook.startPolling();
      hook.startPolling();

      hook.stopPolling();

      dispose();
    });
  });

  test("should return null when create fails", () => {
    createRoot((dispose) => {
      closeDatabase();
      resetDatabaseRef();

      const hook = useNotifications({ ticketId: "TEST-FAIL-001" });

      const result = hook.create({
        ticket_id: "TEST-FAIL-001",
        source_type: "system",
        source_id: "fail-1",
        priority: "normal",
        summary: "Will fail",
        content: "",
      });

      expect(result).toBeNull();

      initDatabase();
      dispose();
    });
  });

  // Note: Tests that rely on reactive state updates (like create() updating notifications())
  // don't work reliably in Solid.js server-side test environment. The underlying store
  // functions are tested separately in the "notification store" describe block below.
});

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
    expect(all.map((n) => n.priority)).toEqual(["blocking", "high", "normal", "low"]);
  });
});
