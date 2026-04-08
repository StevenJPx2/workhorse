/**
 * Tests for get-notifications tool handler
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { handleGetNotifications } from "./get-notifications.ts";
import {
  initNotificationsTable,
  createNotification,
} from "../../notifications/index.ts";
import type { CreateNotificationInput } from "../../notifications/types.ts";

describe("handleGetNotifications", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initNotificationsTable(db);
  });

  afterEach(() => {
    db.close();
  });

  const createSampleNotification = (
    overrides: Partial<CreateNotificationInput> = {}
  ) => {
    return createNotification(db, {
      ticket_id: "AM-123",
      source_type: "github_pr_review",
      source_id: `source-${Date.now()}-${Math.random()}`,
      priority: "normal",
      summary: "Test notification",
      content: "Full content",
      author: "@reviewer",
      ...overrides,
    });
  };

  describe("when no notifications", () => {
    it("should return empty notifications array", () => {
      const result = handleGetNotifications(db, "AM-123");

      expect(result.notifications).toEqual([]);
    });

    it("should return null system_instruction", () => {
      const result = handleGetNotifications(db, "AM-123");

      expect(result.system_instruction).toBeNull();
    });
  });

  describe("when has notifications", () => {
    it("should return unread notifications", () => {
      createSampleNotification({ summary: "First" });
      createSampleNotification({ summary: "Second" });

      const result = handleGetNotifications(db, "AM-123");

      expect(result.notifications.length).toBe(2);
    });

    it("should not return acknowledged notifications", () => {
      const notif = createSampleNotification();
      db.prepare(
        "UPDATE notifications SET status = 'acknowledged' WHERE id = ?"
      ).run(notif!.id);

      const result = handleGetNotifications(db, "AM-123");

      expect(result.notifications.length).toBe(0);
    });

    it("should return notifications ordered by priority", () => {
      createSampleNotification({ priority: "low", summary: "Low" });
      createSampleNotification({ priority: "blocking", summary: "Blocking" });
      createSampleNotification({ priority: "high", summary: "High" });

      const result = handleGetNotifications(db, "AM-123");

      expect(result.notifications[0].priority).toBe("blocking");
      expect(result.notifications[1].priority).toBe("high");
    });

    it("should only return notifications for the specified ticket", () => {
      createSampleNotification({ ticket_id: "AM-123", summary: "For 123" });
      createSampleNotification({ ticket_id: "AM-456", summary: "For 456" });

      const result = handleGetNotifications(db, "AM-123");

      expect(result.notifications.length).toBe(1);
      expect(result.notifications[0].summary).toBe("For 123");
    });
  });

  describe("system_instruction generation", () => {
    it("should include system_instruction when has blocking notifications", () => {
      createSampleNotification({
        priority: "blocking",
        summary: "Blocking issue",
      });

      const result = handleGetNotifications(db, "AM-123");

      expect(result.system_instruction).not.toBeNull();
      expect(result.system_instruction).toContain("<system-instruction>");
      expect(result.system_instruction).toContain("BLOCKING");
    });

    it("should include system_instruction when has high priority notifications", () => {
      createSampleNotification({ priority: "high", summary: "High priority" });

      const result = handleGetNotifications(db, "AM-123");

      expect(result.system_instruction).not.toBeNull();
      expect(result.system_instruction).toContain("high-priority");
    });

    it("should return null system_instruction for only low priority", () => {
      createSampleNotification({ priority: "low", summary: "Low priority" });

      const result = handleGetNotifications(db, "AM-123");

      expect(result.system_instruction).toBeNull();
    });
  });

  describe("marking notifications as read", () => {
    it("should mark returned notifications as read", () => {
      const notif = createSampleNotification();

      handleGetNotifications(db, "AM-123");

      const updated = db
        .prepare("SELECT status, read_at FROM notifications WHERE id = ?")
        .get(notif!.id) as { status: string; read_at: string };

      expect(updated.status).toBe("read");
      expect(updated.read_at).toBeTruthy();
    });
  });
});
