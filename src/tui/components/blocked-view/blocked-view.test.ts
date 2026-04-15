/**
 * Tests for BlockedView component helper functions
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { Notification } from "#core/notifications/types.ts";
import { parseEscalationFromNotification, formatRelativeTime } from "./types.ts";

describe("parseEscalationFromNotification", () => {
  const baseNotification: Notification = {
    id: "notif-1",
    ticket_id: "AM-123",
    source_type: "system",
    source_id: "escalation-123",
    priority: "blocking",
    summary: "Agent needs clarification",
    content: "Questions for user",
    author: null,
    metadata: null,
    status: "unread",
    read_at: null,
    acknowledged_at: null,
    created_at: "2024-01-15T10:30:00Z",
    source_timestamp: null,
  };

  it("should parse escalation with questions from metadata", () => {
    const notification: Notification = {
      ...baseNotification,
      metadata: JSON.stringify({
        questions: ["What is the expected behavior?", "Should retry be enabled?"],
        context: "Working on authentication flow",
      }),
    };

    const result = parseEscalationFromNotification(notification);

    expect(result).not.toBeNull();
    expect(result!.questions).toEqual([
      "What is the expected behavior?",
      "Should retry be enabled?",
    ]);
    expect(result!.context).toBe("Working on authentication flow");
    expect(result!.notificationId).toBe("notif-1");
    expect(result!.postedAt).toBe("2024-01-15T10:30:00Z");
  });

  it("should return empty questions when metadata has no questions", () => {
    const notification: Notification = {
      ...baseNotification,
      metadata: JSON.stringify({ context: "Some context" }),
    };

    const result = parseEscalationFromNotification(notification);

    expect(result).not.toBeNull();
    expect(result!.questions).toEqual([]);
    expect(result!.context).toBe("Some context");
  });

  it("should return empty questions when metadata is null", () => {
    const notification: Notification = {
      ...baseNotification,
      metadata: null,
    };

    const result = parseEscalationFromNotification(notification);

    expect(result).not.toBeNull();
    expect(result!.questions).toEqual([]);
  });

  it("should handle malformed JSON metadata gracefully", () => {
    const notification: Notification = {
      ...baseNotification,
      metadata: "not-valid-json",
    };

    const result = parseEscalationFromNotification(notification);

    expect(result).not.toBeNull();
    expect(result!.questions).toEqual([]);
    expect(result!.postedAt).toBe("2024-01-15T10:30:00Z");
  });

  it("should return null for non-blocking notifications", () => {
    const notification: Notification = {
      ...baseNotification,
      priority: "normal",
      source_type: "jira_comment",
    };

    const result = parseEscalationFromNotification(notification);

    expect(result).toBeNull();
  });

  it("should handle non-array questions in metadata", () => {
    const notification: Notification = {
      ...baseNotification,
      metadata: JSON.stringify({ questions: "single question" }),
    };

    const result = parseEscalationFromNotification(notification);

    expect(result).not.toBeNull();
    expect(result!.questions).toEqual([]);
  });
});

describe("formatRelativeTime", () => {
  let originalDate: typeof Date;
  let mockNow: number;

  beforeEach(() => {
    originalDate = global.Date;
    mockNow = new Date("2024-01-15T12:00:00Z").getTime();

    // Mock Date constructor and Date.now()
    const MockDate = class extends Date {
      constructor(value?: string | number | Date) {
        if (value === undefined) {
          super(mockNow);
        } else {
          super(value);
        }
      }
    } as DateConstructor;
    MockDate.now = () => mockNow;
    MockDate.parse = Date.parse;
    MockDate.UTC = Date.UTC;

    global.Date = MockDate;
  });

  afterEach(() => {
    global.Date = originalDate;
  });

  it("should return 'just now' for timestamps less than a minute ago", () => {
    const timestamp = "2024-01-15T11:59:30Z"; // 30 seconds ago
    expect(formatRelativeTime(timestamp)).toBe("just now");
  });

  it("should return minutes for timestamps less than an hour ago", () => {
    const timestamp = "2024-01-15T11:57:00Z"; // 3 minutes ago
    expect(formatRelativeTime(timestamp)).toBe("3 minutes ago");
  });

  it("should return singular minute", () => {
    const timestamp = "2024-01-15T11:59:00Z"; // 1 minute ago
    expect(formatRelativeTime(timestamp)).toBe("1 minute ago");
  });

  it("should return hours for timestamps less than a day ago", () => {
    const timestamp = "2024-01-15T09:00:00Z"; // 3 hours ago
    expect(formatRelativeTime(timestamp)).toBe("3 hours ago");
  });

  it("should return singular hour", () => {
    const timestamp = "2024-01-15T11:00:00Z"; // 1 hour ago
    expect(formatRelativeTime(timestamp)).toBe("1 hour ago");
  });

  it("should return days for timestamps more than a day ago", () => {
    const timestamp = "2024-01-13T12:00:00Z"; // 2 days ago
    expect(formatRelativeTime(timestamp)).toBe("2 days ago");
  });

  it("should return singular day", () => {
    const timestamp = "2024-01-14T12:00:00Z"; // 1 day ago
    expect(formatRelativeTime(timestamp)).toBe("1 day ago");
  });
});
