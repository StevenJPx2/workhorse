import { describe, test, expect } from "bun:test";
import {
  countUnread,
  filterBlocking,
  markReadInList,
  acknowledgeInList,
  acknowledgeManyInList,
  removeFromList,
  filterByPriority,
  findNewNotifications,
} from "./notification-helpers.ts";
import type { Notification } from "./types.ts";

// Helper to create a notification
const createNotification = (overrides: Partial<Notification> = {}): Notification => ({
  id: `notif-${Math.random().toString(36).slice(2)}`,
  ticket_id: "AM-123",
  priority: "normal",
  status: "unread",
  source_type: "jira_comment",
  source_id: "comment-1",
  summary: "Test notification",
  content: "Test content",
  author: null,
  metadata: null,
  read_at: null,
  acknowledged_at: null,
  created_at: new Date().toISOString(),
  source_timestamp: null,
  ...overrides,
});

describe("countUnread", () => {
  test("counts unread notifications", () => {
    const notifications = [
      createNotification({ status: "unread" }),
      createNotification({ status: "unread" }),
      createNotification({ status: "read" }),
      createNotification({ status: "acknowledged" }),
    ];

    expect(countUnread(notifications)).toBe(2);
  });

  test("returns 0 for empty list", () => {
    expect(countUnread([])).toBe(0);
  });
});

describe("filterBlocking", () => {
  test("filters blocking unacknowledged notifications", () => {
    const notifications = [
      createNotification({ priority: "blocking", status: "unread" }),
      createNotification({ priority: "blocking", status: "acknowledged" }),
      createNotification({ priority: "normal", status: "unread" }),
    ];

    const result = filterBlocking(notifications);
    expect(result).toHaveLength(1);
    expect(result[0].priority).toBe("blocking");
    expect(result[0].status).toBe("unread");
  });
});

describe("markReadInList", () => {
  test("marks notification as read", () => {
    const notifications = [
      createNotification({ id: "notif-1", status: "unread" }),
      createNotification({ id: "notif-2", status: "unread" }),
    ];

    const result = markReadInList(notifications, "notif-1");

    expect(result[0].status).toBe("read");
    expect(result[1].status).toBe("unread");
  });

  test("returns new array (immutable)", () => {
    const notifications = [createNotification({ id: "notif-1" })];
    const result = markReadInList(notifications, "notif-1");

    expect(result).not.toBe(notifications);
    expect(result[0]).not.toBe(notifications[0]);
  });
});

describe("acknowledgeInList", () => {
  test("acknowledges notification", () => {
    const notifications = [createNotification({ id: "notif-1", status: "unread" })];

    const result = acknowledgeInList(notifications, "notif-1");

    expect(result[0].status).toBe("acknowledged");
  });
});

describe("acknowledgeManyInList", () => {
  test("acknowledges multiple notifications", () => {
    const notifications = [
      createNotification({ id: "notif-1", status: "unread" }),
      createNotification({ id: "notif-2", status: "unread" }),
      createNotification({ id: "notif-3", status: "unread" }),
    ];

    const result = acknowledgeManyInList(notifications, ["notif-1", "notif-3"]);

    expect(result[0].status).toBe("acknowledged");
    expect(result[1].status).toBe("unread");
    expect(result[2].status).toBe("acknowledged");
  });
});

describe("removeFromList", () => {
  test("removes notification from list", () => {
    const notifications = [
      createNotification({ id: "notif-1" }),
      createNotification({ id: "notif-2" }),
    ];

    const result = removeFromList(notifications, "notif-1");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("notif-2");
  });
});

describe("filterByPriority", () => {
  test("filters by priority", () => {
    const notifications = [
      createNotification({ priority: "blocking" }),
      createNotification({ priority: "normal" }),
      createNotification({ priority: "blocking" }),
    ];

    const result = filterByPriority(notifications, "blocking");

    expect(result).toHaveLength(2);
    expect(result.every((n) => n.priority === "blocking")).toBe(true);
  });
});

describe("findNewNotifications", () => {
  test("finds notifications not in previous list", () => {
    const previous = [createNotification({ id: "notif-1" }), createNotification({ id: "notif-2" })];
    const current = [
      createNotification({ id: "notif-1" }),
      createNotification({ id: "notif-2" }),
      createNotification({ id: "notif-3" }),
    ];

    const result = findNewNotifications(current, previous);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("notif-3");
  });

  test("returns empty for no new notifications", () => {
    const notifications = [createNotification({ id: "notif-1" })];

    const result = findNewNotifications(notifications, notifications);

    expect(result).toHaveLength(0);
  });
});
