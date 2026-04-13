/**
 * Tests for system-instruction generator
 */

import { describe, it, expect } from "bun:test";
import { generateSystemInstruction } from "./system-instruction.ts";
import type { Notification } from "./types.ts";

describe("generateSystemInstruction", () => {
  const createNotification = (overrides: Partial<Notification> = {}): Notification => ({
    id: "notif_123",
    ticket_id: "AM-123",
    source_type: "github_pr_review",
    source_id: "github-456",
    priority: "normal",
    summary: "Test notification",
    content: "Full content here",
    author: "@reviewer",
    metadata: null,
    status: "unread",
    read_at: null,
    acknowledged_at: null,
    created_at: "2024-01-15T10:30:00Z",
    source_timestamp: null,
    ...overrides,
  });

  describe("when no notifications", () => {
    it("should return null for empty array", () => {
      const result = generateSystemInstruction([]);
      expect(result).toBeNull();
    });
  });

  describe("when has blocking notifications", () => {
    it("should include BLOCKING header with warning", () => {
      const notifications = [
        createNotification({
          priority: "blocking",
          summary: "PR changes requested",
        }),
      ];

      const result = generateSystemInstruction(notifications);

      expect(result).toContain("<system-instruction>");
      expect(result).toContain("</system-instruction>");
      expect(result).toContain("BLOCKING");
      expect(result).toContain("1 item(s) require immediate attention");
      expect(result).toContain("PR changes requested");
    });

    it("should list multiple blocking items", () => {
      const notifications = [
        createNotification({
          id: "1",
          source_id: "1",
          priority: "blocking",
          summary: "First blocking issue",
        }),
        createNotification({
          id: "2",
          source_id: "2",
          priority: "blocking",
          summary: "Second blocking issue",
        }),
      ];

      const result = generateSystemInstruction(notifications);

      expect(result).toContain("2 item(s) require immediate attention");
      expect(result).toContain("First blocking issue");
      expect(result).toContain("Second blocking issue");
    });
  });

  describe("when has high priority notifications", () => {
    it("should include high-priority section", () => {
      const notifications = [
        createNotification({
          priority: "high",
          summary: "PR review comment",
        }),
      ];

      const result = generateSystemInstruction(notifications);

      expect(result).toContain("1 high-priority notification(s)");
      expect(result).toContain("PR review comment");
    });
  });

  describe("when has normal priority notifications", () => {
    it("should include count of other notifications", () => {
      const notifications = [
        createNotification({
          priority: "normal",
          summary: "General comment",
        }),
      ];

      const result = generateSystemInstruction(notifications);

      expect(result).toContain("1 other notification(s) pending");
    });

    it("should not list normal summaries (only count)", () => {
      const notifications = [
        createNotification({
          priority: "normal",
          summary: "This should not appear in instruction",
        }),
      ];

      const result = generateSystemInstruction(notifications);

      expect(result).not.toContain("This should not appear in instruction");
    });
  });

  describe("when has low priority notifications", () => {
    it("should not include low priority in summary", () => {
      const notifications = [
        createNotification({
          priority: "low",
          summary: "Low priority item",
        }),
      ];

      const result = generateSystemInstruction(notifications);

      // Low priority notifications don't generate system instruction
      expect(result).toBeNull();
    });
  });

  describe("when has mixed priorities", () => {
    it("should include all sections in correct order", () => {
      const notifications = [
        createNotification({
          id: "1",
          source_id: "1",
          priority: "blocking",
          summary: "Blocking item",
        }),
        createNotification({
          id: "2",
          source_id: "2",
          priority: "high",
          summary: "High priority item",
        }),
        createNotification({
          id: "3",
          source_id: "3",
          priority: "normal",
          summary: "Normal item",
        }),
        createNotification({
          id: "4",
          source_id: "4",
          priority: "low",
          summary: "Low item",
        }),
      ];

      const result = generateSystemInstruction(notifications);

      expect(result).toContain("BLOCKING");
      expect(result).toContain("Blocking item");
      expect(result).toContain("1 high-priority notification(s)");
      expect(result).toContain("High priority item");
      expect(result).toContain("1 other notification(s) pending");

      // Low priority should not be mentioned
      expect(result).not.toContain("Low item");
    });

    it("should show blocking before high priority", () => {
      const notifications = [
        createNotification({
          id: "1",
          source_id: "1",
          priority: "high",
          summary: "High item",
        }),
        createNotification({
          id: "2",
          source_id: "2",
          priority: "blocking",
          summary: "Blocking item",
        }),
      ];

      const result = generateSystemInstruction(notifications)!;
      const blockingIndex = result.indexOf("BLOCKING");
      const highIndex = result.indexOf("high-priority");

      expect(blockingIndex).toBeLessThan(highIndex);
    });
  });

  describe("instruction content", () => {
    it("should include action guidance", () => {
      const notifications = [
        createNotification({
          priority: "high",
          summary: "Test",
        }),
      ];

      const result = generateSystemInstruction(notifications);

      expect(result).toContain("jiratown_get_notifications");
      expect(result).toContain("jiratown_acknowledge");
    });

    it("should be wrapped in system-instruction tags", () => {
      const notifications = [
        createNotification({
          priority: "high",
          summary: "Test",
        }),
      ];

      const result = generateSystemInstruction(notifications)!;

      expect(result.startsWith("<system-instruction>")).toBe(true);
      expect(result.endsWith("</system-instruction>")).toBe(true);
    });
  });
});
