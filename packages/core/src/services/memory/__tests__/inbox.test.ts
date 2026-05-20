import { describe, expect, it } from "vitest";

import type { Notification } from "#db";

import { generateSystemInbox } from "../inbox.ts";

describe("inbox: XML notification formatting", () => {
  describe("generateSystemInbox", () => {
    it("returns empty element for no notifications", () => {
      const result = generateSystemInbox([]);
      expect(result).toBe("<system_inbox />");
    });

    it("formats a single notification", () => {
      const notifications: Notification[] = [
        {
          id: "notif-1",
          issueId: "AM-123",
          priority: "normal",
          status: "unread",
          source: "jira",
          sourceId: "jira-comment-456",
          title: "New comment",
          body: "Please review the implementation",
          createdAt: new Date("2025-07-15T10:00:00Z"),
          readAt: null,
          acknowledgedAt: null,
          metadata: null,
        },
      ];

      const result = generateSystemInbox(notifications);

      expect(result).toContain("<system_inbox>");
      expect(result).toContain('id="notif-1"');
      expect(result).toContain('priority="normal"');
      expect(result).toContain('source="jira"');
      expect(result).toContain("<title>New comment</title>");
      expect(result).toContain("<body>Please review the implementation</body>");
      expect(result).toContain("</system_inbox>");
    });

    it("formats multiple notifications", () => {
      const notifications: Notification[] = [
        {
          id: "notif-1",
          issueId: "AM-123",
          priority: "high",
          status: "unread",
          source: "github",
          sourceId: null,
          title: "PR review requested",
          body: "Review needed for PR #42",
          createdAt: new Date("2025-07-15T10:00:00Z"),
          readAt: null,
          acknowledgedAt: null,
          metadata: null,
        },
        {
          id: "notif-2",
          issueId: "AM-123",
          priority: "blocking",
          status: "unread",
          source: "system",
          sourceId: null,
          title: "Build failed",
          body: "CI build failed on main branch",
          createdAt: new Date("2025-07-15T11:00:00Z"),
          readAt: null,
          acknowledgedAt: null,
          metadata: null,
        },
      ];

      const result = generateSystemInbox(notifications);

      expect(result).toContain('id="notif-1"');
      expect(result).toContain('id="notif-2"');
      expect(result).toContain('priority="high"');
      expect(result).toContain('priority="blocking"');
      expect(result).toContain('source="github"');
      expect(result).toContain('source="system"');
    });

    it("escapes XML special characters in content", () => {
      const notifications: Notification[] = [
        {
          id: "notif-1",
          issueId: "AM-123",
          priority: "normal",
          status: "unread",
          source: "jira",
          sourceId: null,
          title: "Fix <bug> & issue",
          body: 'Check "value" > 100 && x < 5',
          createdAt: new Date("2025-07-15T10:00:00Z"),
          readAt: null,
          acknowledgedAt: null,
          metadata: null,
        },
      ];

      const result = generateSystemInbox(notifications);

      // Check XML escaping
      expect(result).toContain("&lt;bug&gt;");
      expect(result).toContain("&amp;");
      expect(result).toContain("&quot;value&quot;");
      expect(result).not.toContain("<bug>");
      expect(result).not.toContain('"value"');
    });

    it("escapes XML special characters in attributes", () => {
      const notifications: Notification[] = [
        {
          id: 'notif-with-"quotes"',
          issueId: "AM-123",
          priority: "normal",
          status: "unread",
          source: "test&source",
          sourceId: null,
          title: "Test",
          body: "Test body",
          createdAt: new Date("2025-07-15T10:00:00Z"),
          readAt: null,
          acknowledgedAt: null,
          metadata: null,
        },
      ];

      const result = generateSystemInbox(notifications);

      expect(result).toContain("&quot;quotes&quot;");
      expect(result).toContain("test&amp;source");
    });

    it("handles single quotes in content", () => {
      const notifications: Notification[] = [
        {
          id: "notif-1",
          issueId: "AM-123",
          priority: "normal",
          status: "unread",
          source: "jira",
          sourceId: null,
          title: "It's working",
          body: "The user's data was saved",
          createdAt: new Date("2025-07-15T10:00:00Z"),
          readAt: null,
          acknowledgedAt: null,
          metadata: null,
        },
      ];

      const result = generateSystemInbox(notifications);

      expect(result).toContain("&apos;s working");
      expect(result).toContain("user&apos;s data");
    });

    it("produces well-formed XML structure", () => {
      const notifications: Notification[] = [
        {
          id: "notif-1",
          issueId: "AM-123",
          priority: "normal",
          status: "unread",
          source: "jira",
          sourceId: null,
          title: "Test",
          body: "Test body",
          createdAt: new Date("2025-07-15T10:00:00Z"),
          readAt: null,
          acknowledgedAt: null,
          metadata: null,
        },
      ];

      const result = generateSystemInbox(notifications);
      const lines = result.split("\n");

      // Check structure
      expect(lines[0]).toBe("<system_inbox>");
      expect(lines[lines.length - 1]).toBe("</system_inbox>");

      // Check indentation (notifications should be indented)
      expect(lines[1]).toMatch(/^\s{2}<notification/);
      expect(lines[2]).toMatch(/^\s{4}<title>/);
      expect(lines[3]).toMatch(/^\s{4}<body>/);
    });

    it("includes comment_id attribute when metadata has commentId", () => {
      const notifications: Notification[] = [
        {
          id: "notif-1",
          issueId: "AM-123",
          priority: "normal",
          status: "unread",
          source: "jira",
          sourceId: "jira-comment-456",
          title: "New comment from John",
          body: "Please check the implementation",
          createdAt: new Date("2025-07-15T10:00:00Z"),
          readAt: null,
          acknowledgedAt: null,
          metadata: { commentId: "456", author: "John" },
        },
      ];

      const result = generateSystemInbox(notifications);

      expect(result).toContain('comment_id="456"');
      expect(result).toContain('source="jira"');
    });

    it("omits comment_id attribute when metadata has no commentId", () => {
      const notifications: Notification[] = [
        {
          id: "notif-1",
          issueId: "AM-123",
          priority: "normal",
          status: "unread",
          source: "github",
          sourceId: "github-review-789",
          title: "PR review",
          body: "Changes requested",
          createdAt: new Date("2025-07-15T10:00:00Z"),
          readAt: null,
          acknowledgedAt: null,
          metadata: { reviewId: "789" }, // No commentId
        },
      ];

      const result = generateSystemInbox(notifications);

      expect(result).not.toContain("comment_id");
      expect(result).toContain('source="github"');
    });

    it("omits comment_id attribute when metadata is null", () => {
      const notifications: Notification[] = [
        {
          id: "notif-1",
          issueId: "AM-123",
          priority: "normal",
          status: "unread",
          source: "system",
          sourceId: null,
          title: "System notification",
          body: "Something happened",
          createdAt: new Date("2025-07-15T10:00:00Z"),
          readAt: null,
          acknowledgedAt: null,
          metadata: null,
        },
      ];

      const result = generateSystemInbox(notifications);

      expect(result).not.toContain("comment_id");
    });

    it.fails("TODO: generateSystemInbox should handle null body gracefully", () => {
      // Currently generateSystemInbox crashes when body is null because
      // escapeXml doesn't handle null values. Future enhancement: handle nulls.
      const notifications: Notification[] = [
        {
          id: "notif-1",
          issueId: "AM-123",
          priority: "normal",
          status: "unread",
          source: "jira",
          sourceId: null,
          title: "Test",
          body: null as unknown as string, // Simulating unexpected null
          createdAt: new Date("2025-07-15T10:00:00Z"),
          readAt: null,
          acknowledgedAt: null,
          metadata: null,
        },
      ];

      // Should not throw, but currently does
      const result = generateSystemInbox(notifications);
      expect(result).toContain("<notification");
    });
  });
});
