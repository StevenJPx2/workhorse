/**
 * Tests for acknowledge tool handler
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { handleAcknowledge } from "./acknowledge.ts";
import {
  initNotificationsTable,
  createNotification,
  getNotificationById,
} from "../../notifications/index.ts";

describe("handleAcknowledge", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initNotificationsTable(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("when acknowledging notifications", () => {
    it("should acknowledge a single notification", () => {
      const notif = createNotification(db, {
        ticket_id: "AM-123",
        source_type: "github_pr_review",
        source_id: "source-1",
        priority: "high",
        summary: "Test",
        content: "Content",
      });

      const result = handleAcknowledge(db, { notification_ids: [notif!.id] });

      expect(result.acknowledged_count).toBe(1);

      const updated = getNotificationById(db, notif!.id);
      expect(updated!.status).toBe("acknowledged");
      expect(updated!.acknowledged_at).toBeTruthy();
    });

    it("should acknowledge multiple notifications", () => {
      const notif1 = createNotification(db, {
        ticket_id: "AM-123",
        source_type: "github_pr_review",
        source_id: "source-1",
        priority: "high",
        summary: "Test 1",
        content: "Content",
      });
      const notif2 = createNotification(db, {
        ticket_id: "AM-123",
        source_type: "github_pr_review",
        source_id: "source-2",
        priority: "high",
        summary: "Test 2",
        content: "Content",
      });

      const result = handleAcknowledge(db, {
        notification_ids: [notif1!.id, notif2!.id],
      });

      expect(result.acknowledged_count).toBe(2);

      expect(getNotificationById(db, notif1!.id)!.status).toBe("acknowledged");
      expect(getNotificationById(db, notif2!.id)!.status).toBe("acknowledged");
    });

    it("should return 0 for empty array", () => {
      const result = handleAcknowledge(db, { notification_ids: [] });

      expect(result.acknowledged_count).toBe(0);
    });

    it("should handle non-existent notification ids gracefully", () => {
      const result = handleAcknowledge(db, {
        notification_ids: ["non-existent-1", "non-existent-2"],
      });

      // Should not throw, but count may be 0
      expect(result.acknowledged_count).toBe(0);
    });

    it("should handle mixed existing and non-existent ids", () => {
      const notif = createNotification(db, {
        ticket_id: "AM-123",
        source_type: "github_pr_review",
        source_id: "source-1",
        priority: "high",
        summary: "Test",
        content: "Content",
      });

      const result = handleAcknowledge(db, {
        notification_ids: [notif!.id, "non-existent"],
      });

      expect(result.acknowledged_count).toBe(1);
    });
  });
});
