/**
 * Tests for notification-helpers
 */

import { describe, it, expect } from "bun:test";
import type { Notification } from "#core/notifications/types.ts";
// TUI-specific helpers
import { resolveTicketId, handleNotificationError } from "./notification-helpers.ts";
// Pure helpers from core
import {
  countUnread,
  filterBlocking,
  markReadInList,
  acknowledgeInList,
  acknowledgeManyInList,
  removeFromList,
  filterByPriority,
  findNewNotifications,
} from "#core/notifications/index.ts";

// Helper to create mock notifications
function createMockNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "1",
    ticket_id: "TEST-123",
    source_type: "system",
    source_id: "src-1",
    priority: "normal",
    status: "unread",
    summary: "Test summary",
    content: "Test content",
    author: null,
    metadata: null,
    read_at: null,
    acknowledged_at: null,
    created_at: new Date().toISOString(),
    source_timestamp: null,
    ...overrides,
  };
}

describe("notification-helpers", () => {
  describe("resolveTicketId", () => {
    it("should return string ticketId directly", () => {
      const result = resolveTicketId({ ticketId: "TEST-123" });
      expect(result).toBe("TEST-123");
    });

    it("should call function ticketId", () => {
      const result = resolveTicketId({ ticketId: () => "TEST-456" });
      expect(result).toBe("TEST-456");
    });

    it("should return undefined when no ticketId", () => {
      const result = resolveTicketId({});
      expect(result).toBeUndefined();
    });

    it("should handle function returning undefined", () => {
      const result = resolveTicketId({ ticketId: () => undefined });
      expect(result).toBeUndefined();
    });
  });

  describe("handleNotificationError", () => {
    it("should handle Error instances", () => {
      const setError = (_e: Error | null) => {};
      const error = new Error("Test error");
      const result = handleNotificationError(error, setError);
      expect(result.message).toBe("Test error");
      expect(result).toBeInstanceOf(Error);
    });

    it("should handle string errors", () => {
      const setError = (_e: Error | null) => {};
      const result = handleNotificationError("String error", setError);
      expect(result.message).toBe("String error");
      expect(result).toBeInstanceOf(Error);
    });

    it("should handle number errors", () => {
      const setError = (_e: Error | null) => {};
      const result = handleNotificationError(500, setError);
      expect(result.message).toBe("500");
    });

    it("should handle null errors", () => {
      const setError = (_e: Error | null) => {};
      const result = handleNotificationError(null, setError);
      expect(result.message).toBe("null");
    });

    it("should call setError with error", () => {
      let capturedError: Error | null = null;
      const setError = (e: Error | null) => {
        capturedError = e;
      };
      const error = new Error("Test");
      handleNotificationError(error, setError);
      expect(capturedError).toBeInstanceOf(Error);
      expect((capturedError as unknown as Error).message).toBe("Test");
    });

    it("should call onError callback", () => {
      let callbackError: Error | null = null;
      const onError = (e: Error) => {
        callbackError = e;
      };
      const setError = (_e: Error | null) => {};
      handleNotificationError(new Error("Callback test"), setError, onError);
      expect((callbackError as unknown as Error).message).toBe("Callback test");
    });

    it("should work without onError callback", () => {
      const setError = (_e: Error | null) => {};
      const result = handleNotificationError(new Error("Test"), setError);
      expect(result).toBeInstanceOf(Error);
    });
  });

  describe("countUnread", () => {
    it("should count unread notifications", () => {
      const notifications: Notification[] = [
        createMockNotification({ id: "1", status: "unread" }),
        createMockNotification({ id: "2", status: "read" }),
        createMockNotification({ id: "3", status: "unread" }),
        createMockNotification({ id: "4", status: "acknowledged" }),
      ];
      expect(countUnread(notifications)).toBe(2);
    });

    it("should return 0 for empty array", () => {
      expect(countUnread([])).toBe(0);
    });

    it("should return 0 when no unread", () => {
      const notifications: Notification[] = [
        createMockNotification({ id: "1", status: "read" }),
        createMockNotification({ id: "2", status: "acknowledged" }),
      ];
      expect(countUnread(notifications)).toBe(0);
    });

    it("should count all when all unread", () => {
      const notifications: Notification[] = [
        createMockNotification({ id: "1", status: "unread" }),
        createMockNotification({ id: "2", status: "unread" }),
      ];
      expect(countUnread(notifications)).toBe(2);
    });
  });

  describe("filterBlocking", () => {
    it("should filter blocking and unacknowledged notifications", () => {
      const notifications: Notification[] = [
        createMockNotification({ id: "1", priority: "blocking", status: "unread" }),
        createMockNotification({ id: "2", priority: "blocking", status: "read" }),
        createMockNotification({ id: "3", priority: "blocking", status: "acknowledged" }),
        createMockNotification({ id: "4", priority: "high", status: "unread" }),
        createMockNotification({ id: "5", priority: "normal", status: "unread" }),
      ];
      const result = filterBlocking(notifications);
      expect(result).toHaveLength(2);
      expect(result.map((n) => n.id)).toEqual(["1", "2"]);
    });

    it("should return empty array when no blocking", () => {
      const notifications: Notification[] = [
        createMockNotification({ id: "1", priority: "high" }),
        createMockNotification({ id: "2", priority: "normal" }),
      ];
      expect(filterBlocking(notifications)).toEqual([]);
    });

    it("should return empty array for empty input", () => {
      expect(filterBlocking([])).toEqual([]);
    });

    it("should exclude all acknowledged blocking", () => {
      const notifications: Notification[] = [
        createMockNotification({ id: "1", priority: "blocking", status: "acknowledged" }),
        createMockNotification({ id: "2", priority: "blocking", status: "acknowledged" }),
      ];
      expect(filterBlocking(notifications)).toEqual([]);
    });
  });

  describe("markReadInList", () => {
    it("should mark specific notification as read", () => {
      const notifications: Notification[] = [
        createMockNotification({ id: "1", status: "unread" }),
        createMockNotification({ id: "2", status: "unread" }),
      ];
      const result = markReadInList(notifications, "1");
      expect(result[0].status).toBe("read");
      expect(result[1].status).toBe("unread");
    });

    it("should not mutate original array", () => {
      const notifications: Notification[] = [createMockNotification({ id: "1", status: "unread" })];
      const result = markReadInList(notifications, "1");
      expect(notifications[0].status).toBe("unread");
      expect(result[0].status).toBe("read");
    });

    it("should handle non-existent id", () => {
      const notifications: Notification[] = [createMockNotification({ id: "1", status: "unread" })];
      const result = markReadInList(notifications, "999");
      expect(result[0].status).toBe("unread");
    });

    it("should handle empty array", () => {
      const result = markReadInList([], "1");
      expect(result).toEqual([]);
    });
  });

  describe("acknowledgeInList", () => {
    it("should acknowledge specific notification", () => {
      const notifications: Notification[] = [
        createMockNotification({ id: "1", status: "unread" }),
        createMockNotification({ id: "2", status: "unread" }),
      ];
      const result = acknowledgeInList(notifications, "1");
      expect(result[0].status).toBe("acknowledged");
      expect(result[1].status).toBe("unread");
    });

    it("should work with already read notifications", () => {
      const notifications: Notification[] = [createMockNotification({ id: "1", status: "read" })];
      const result = acknowledgeInList(notifications, "1");
      expect(result[0].status).toBe("acknowledged");
    });

    it("should handle non-existent id", () => {
      const notifications: Notification[] = [createMockNotification({ id: "1", status: "unread" })];
      const result = acknowledgeInList(notifications, "999");
      expect(result[0].status).toBe("unread");
    });
  });

  describe("acknowledgeManyInList", () => {
    it("should acknowledge multiple notifications", () => {
      const notifications: Notification[] = [
        createMockNotification({ id: "1", status: "unread" }),
        createMockNotification({ id: "2", status: "unread" }),
        createMockNotification({ id: "3", status: "unread" }),
      ];
      const result = acknowledgeManyInList(notifications, ["1", "3"]);
      expect(result[0].status).toBe("acknowledged");
      expect(result[1].status).toBe("unread");
      expect(result[2].status).toBe("acknowledged");
    });

    it("should handle empty ids array", () => {
      const notifications: Notification[] = [createMockNotification({ id: "1", status: "unread" })];
      const result = acknowledgeManyInList(notifications, []);
      expect(result[0].status).toBe("unread");
    });

    it("should handle non-existent ids", () => {
      const notifications: Notification[] = [createMockNotification({ id: "1", status: "unread" })];
      const result = acknowledgeManyInList(notifications, ["999"]);
      expect(result[0].status).toBe("unread");
    });
  });

  describe("removeFromList", () => {
    it("should remove specific notification", () => {
      const notifications: Notification[] = [
        createMockNotification({ id: "1" }),
        createMockNotification({ id: "2" }),
      ];
      const result = removeFromList(notifications, "1");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("2");
    });

    it("should handle non-existent id", () => {
      const notifications: Notification[] = [createMockNotification({ id: "1" })];
      const result = removeFromList(notifications, "999");
      expect(result).toHaveLength(1);
    });

    it("should handle empty array", () => {
      const result = removeFromList([], "1");
      expect(result).toEqual([]);
    });

    it("should not mutate original array", () => {
      const notifications: Notification[] = [
        createMockNotification({ id: "1" }),
        createMockNotification({ id: "2" }),
      ];
      const result = removeFromList(notifications, "1");
      expect(notifications).toHaveLength(2);
      expect(result).toHaveLength(1);
    });
  });

  describe("filterByPriority", () => {
    it("should filter by blocking priority", () => {
      const notifications: Notification[] = [
        createMockNotification({ id: "1", priority: "blocking" }),
        createMockNotification({ id: "2", priority: "high" }),
        createMockNotification({ id: "3", priority: "blocking" }),
      ];
      const result = filterByPriority(notifications, "blocking");
      expect(result).toHaveLength(2);
      expect(result.map((n) => n.id)).toEqual(["1", "3"]);
    });

    it("should filter by high priority", () => {
      const notifications: Notification[] = [
        createMockNotification({ id: "1", priority: "high" }),
        createMockNotification({ id: "2", priority: "normal" }),
      ];
      const result = filterByPriority(notifications, "high");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("should return empty array when no matches", () => {
      const notifications: Notification[] = [
        createMockNotification({ id: "1", priority: "normal" }),
      ];
      const result = filterByPriority(notifications, "blocking");
      expect(result).toEqual([]);
    });

    it("should handle empty array", () => {
      expect(filterByPriority([], "normal")).toEqual([]);
    });
  });

  describe("findNewNotifications", () => {
    it("should find notifications not in previous list", () => {
      const current: Notification[] = [
        createMockNotification({ id: "1" }),
        createMockNotification({ id: "2" }),
        createMockNotification({ id: "3" }),
      ];
      const previous: Notification[] = [createMockNotification({ id: "1" })];
      const result = findNewNotifications(current, previous);
      expect(result).toHaveLength(2);
      expect(result.map((n) => n.id)).toEqual(["2", "3"]);
    });

    it("should return all when previous is empty", () => {
      const current: Notification[] = [
        createMockNotification({ id: "1" }),
        createMockNotification({ id: "2" }),
      ];
      const result = findNewNotifications(current, []);
      expect(result).toHaveLength(2);
    });

    it("should return empty when no new notifications", () => {
      const current: Notification[] = [
        createMockNotification({ id: "1" }),
        createMockNotification({ id: "2" }),
      ];
      const previous: Notification[] = [
        createMockNotification({ id: "1" }),
        createMockNotification({ id: "2" }),
      ];
      const result = findNewNotifications(current, previous);
      expect(result).toEqual([]);
    });

    it("should handle empty current array", () => {
      const previous: Notification[] = [createMockNotification({ id: "1" })];
      const result = findNewNotifications([], previous);
      expect(result).toEqual([]);
    });
  });
});
