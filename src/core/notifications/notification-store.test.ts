/**
 * Tests for notification store
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  initNotificationsTable,
  createNotification,
  getNotificationById,
  getNotificationsByTicket,
  getUnreadNotifications,
  markNotificationRead,
  markNotificationAcknowledged,
  acknowledgeNotifications,
  deleteNotification,
  getNotificationBySource,
} from "./notification-store.ts";
import type { CreateNotificationInput } from "./types.ts";

describe("notification-store", () => {
  let db: Database;

  beforeEach(() => {
    // Create in-memory database for tests
    db = new Database(":memory:");
    initNotificationsTable(db);
  });

  afterEach(() => {
    db.close();
  });

  const sampleNotification: CreateNotificationInput = {
    ticket_id: "AM-123",
    source_type: "github_pr_review",
    source_id: "github-comment-456",
    priority: "high",
    summary: "PR Review from @reviewer",
    content: "Consider using exponential backoff here.",
    author: "@reviewer",
    metadata: { file: "src/auth.ts", line: 42 },
    source_timestamp: "2024-01-15T10:30:00Z",
  };

  describe("initNotificationsTable", () => {
    it("should create notifications table", () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'")
        .get();
      expect(tables).toBeTruthy();
    });

    it("should create unique index on source_type and source_id", () => {
      const index = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_notifications_source'",
        )
        .get();
      expect(index).toBeTruthy();
    });

    it("should be idempotent (can run multiple times)", () => {
      expect(() => initNotificationsTable(db)).not.toThrow();
      expect(() => initNotificationsTable(db)).not.toThrow();
    });
  });

  describe("createNotification", () => {
    it("should create a notification and return it", () => {
      const notification = createNotification(db, sampleNotification);

      expect(notification).toBeTruthy();
      expect(notification!.id).toBeTruthy();
      expect(notification!.ticket_id).toBe("AM-123");
      expect(notification!.source_type).toBe("github_pr_review");
      expect(notification!.source_id).toBe("github-comment-456");
      expect(notification!.priority).toBe("high");
      expect(notification!.summary).toBe("PR Review from @reviewer");
      expect(notification!.content).toBe("Consider using exponential backoff here.");
      expect(notification!.author).toBe("@reviewer");
      expect(notification!.status).toBe("unread");
      expect(notification!.created_at).toBeTruthy();
    });

    it("should store metadata as JSON string", () => {
      const notification = createNotification(db, sampleNotification);

      expect(notification!.metadata).toBe(JSON.stringify({ file: "src/auth.ts", line: 42 }));
    });

    it("should deduplicate by source_type and source_id", () => {
      const first = createNotification(db, sampleNotification);
      const second = createNotification(db, sampleNotification);

      expect(first).toBeTruthy();
      expect(second).toBeNull(); // Should return null on duplicate
    });

    it("should allow same source_id with different source_type", () => {
      const first = createNotification(db, sampleNotification);
      const second = createNotification(db, {
        ...sampleNotification,
        source_type: "jira_comment",
      });

      expect(first).toBeTruthy();
      expect(second).toBeTruthy();
      expect(first!.id).not.toBe(second!.id);
    });

    it("should handle null author", () => {
      const input: CreateNotificationInput = {
        ...sampleNotification,
        source_id: "different-id",
        author: undefined,
      };
      const notification = createNotification(db, input);

      expect(notification!.author).toBeNull();
    });

    it("should handle null metadata", () => {
      const input: CreateNotificationInput = {
        ...sampleNotification,
        source_id: "different-id-2",
        metadata: undefined,
      };
      const notification = createNotification(db, input);

      expect(notification!.metadata).toBeNull();
    });
  });

  describe("getNotificationById", () => {
    it("should return notification by id", () => {
      const created = createNotification(db, sampleNotification);
      const retrieved = getNotificationById(db, created!.id);

      expect(retrieved).toEqual(created);
    });

    it("should return null for non-existent id", () => {
      const retrieved = getNotificationById(db, "non-existent");

      expect(retrieved).toBeNull();
    });
  });

  describe("getNotificationBySource", () => {
    it("should return notification by source_type and source_id", () => {
      const created = createNotification(db, sampleNotification);
      const retrieved = getNotificationBySource(db, "github_pr_review", "github-comment-456");

      expect(retrieved).toEqual(created);
    });

    it("should return null for non-existent source", () => {
      const retrieved = getNotificationBySource(db, "github_pr_review", "non-existent");

      expect(retrieved).toBeNull();
    });
  });

  describe("getNotificationsByTicket", () => {
    it("should return all notifications for a ticket", () => {
      createNotification(db, sampleNotification);
      createNotification(db, {
        ...sampleNotification,
        source_id: "another-comment",
        summary: "Another review",
      });

      const notifications = getNotificationsByTicket(db, "AM-123");

      expect(notifications.length).toBe(2);
    });

    it("should return empty array for ticket with no notifications", () => {
      const notifications = getNotificationsByTicket(db, "AM-999");

      expect(notifications).toEqual([]);
    });

    it("should order by priority (blocking first, then high, normal, low)", () => {
      createNotification(db, {
        ...sampleNotification,
        source_id: "low-priority",
        priority: "low",
      });
      createNotification(db, {
        ...sampleNotification,
        source_id: "blocking",
        priority: "blocking",
      });
      createNotification(db, {
        ...sampleNotification,
        source_id: "normal",
        priority: "normal",
      });
      createNotification(db, {
        ...sampleNotification,
        source_id: "high",
        priority: "high",
      });

      const notifications = getNotificationsByTicket(db, "AM-123");

      expect(notifications[0].priority).toBe("blocking");
      expect(notifications[1].priority).toBe("high");
      expect(notifications[2].priority).toBe("normal");
      expect(notifications[3].priority).toBe("low");
    });
  });

  describe("getUnreadNotifications", () => {
    it("should return only unread notifications", () => {
      const notif = createNotification(db, sampleNotification);
      createNotification(db, {
        ...sampleNotification,
        source_id: "read-notif",
      });

      // Mark one as read
      markNotificationRead(db, notif!.id);

      const unread = getUnreadNotifications(db, "AM-123");

      expect(unread.length).toBe(1);
      expect(unread[0].source_id).toBe("read-notif");
    });

    it("should order by priority (blocking first)", () => {
      createNotification(db, {
        ...sampleNotification,
        source_id: "normal-1",
        priority: "normal",
      });
      createNotification(db, {
        ...sampleNotification,
        source_id: "blocking-1",
        priority: "blocking",
      });
      createNotification(db, {
        ...sampleNotification,
        source_id: "high-1",
        priority: "high",
      });

      const unread = getUnreadNotifications(db, "AM-123");

      expect(unread[0].priority).toBe("blocking");
      expect(unread[1].priority).toBe("high");
      expect(unread[2].priority).toBe("normal");
    });
  });

  describe("markNotificationRead", () => {
    it("should update status to read and set read_at", () => {
      const notif = createNotification(db, sampleNotification);
      markNotificationRead(db, notif!.id);

      const updated = getNotificationById(db, notif!.id);

      expect(updated!.status).toBe("read");
      expect(updated!.read_at).toBeTruthy();
    });

    it("should not throw for non-existent notification", () => {
      expect(() => markNotificationRead(db, "non-existent")).not.toThrow();
    });
  });

  describe("markNotificationAcknowledged", () => {
    it("should update status to acknowledged and set acknowledged_at", () => {
      const notif = createNotification(db, sampleNotification);
      markNotificationAcknowledged(db, notif!.id);

      const updated = getNotificationById(db, notif!.id);

      expect(updated!.status).toBe("acknowledged");
      expect(updated!.acknowledged_at).toBeTruthy();
    });
  });

  describe("acknowledgeNotifications", () => {
    it("should acknowledge multiple notifications", () => {
      const notif1 = createNotification(db, sampleNotification);
      const notif2 = createNotification(db, {
        ...sampleNotification,
        source_id: "another",
      });

      acknowledgeNotifications(db, [notif1!.id, notif2!.id]);

      const updated1 = getNotificationById(db, notif1!.id);
      const updated2 = getNotificationById(db, notif2!.id);

      expect(updated1!.status).toBe("acknowledged");
      expect(updated2!.status).toBe("acknowledged");
    });

    it("should handle empty array", () => {
      expect(() => acknowledgeNotifications(db, [])).not.toThrow();
    });
  });

  describe("deleteNotification", () => {
    it("should delete notification", () => {
      const notif = createNotification(db, sampleNotification);
      deleteNotification(db, notif!.id);

      const retrieved = getNotificationById(db, notif!.id);

      expect(retrieved).toBeNull();
    });

    it("should not throw for non-existent notification", () => {
      expect(() => deleteNotification(db, "non-existent")).not.toThrow();
    });
  });
});
