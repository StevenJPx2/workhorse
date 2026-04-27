/**
 * Tests for Jira comment monitor.
 */

import { describe, expect, it, vi } from "vitest";
import { createJiraCommentMonitor } from "../monitor.ts";
import type { AtlassianClient } from "../client.ts";
import type { MonitorContext } from "../../../../services/monitor/types.ts";
import type { Issue } from "#db";

describe("createJiraCommentMonitor", () => {
  it("returns monitor options with correct id and type", () => {
    const mockClient = {} as AtlassianClient;
    const mockDb = {} as any;
    const monitor = createJiraCommentMonitor(mockClient, 30_000, mockDb);

    expect(monitor.id).toBe("jira-comments");
    expect(monitor.type).toBe("remote");
    expect(monitor.interval).toBe(30_000);
  });

  it("returns no changes for non-jira issues", async () => {
    const mockClient = {
      fetchIssue: vi.fn(),
    } as unknown as AtlassianClient;

    const mockDb = {
      issues: {
        getById: vi.fn().mockReturnValue({ source: "github" } as Issue),
      },
    };

    const monitor = createJiraCommentMonitor(mockClient, 30_000, mockDb as any);

    const ctx: MonitorContext = {
      issueId: "issue-123",
      hooks: { emit: vi.fn() } as any,
      memory: { notifications: { create: vi.fn() } } as any,
      config: {} as any,
    };

    const result = await monitor.poll(ctx);
    expect(result.hasChanges).toBe(false);
    expect(mockClient.fetchIssue).not.toHaveBeenCalled();
  });

  it("creates notifications for new comments", async () => {
    const issue = {
      id: "issue-123",
      externalId: "AM-123",
      source: "jira",
      title: "Test",
      description: "",
      status: "pending",
      issueType: "task",
      url: null,
      assignee: null,
      labels: null,
      metadata: {},
      worktreePath: null,
      prUrl: null,
      prNumber: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Issue;

    const mockClient = {
      fetchIssue: vi.fn().mockResolvedValue({
        key: "AM-123",
        fields: {
          comment: {
            comments: [
              {
                id: "10001",
                author: { displayName: "Alice", accountId: "abc" },
                body: "New comment",
                created: "2024-01-01T10:00:00Z",
                updated: "2024-01-01T10:00:00Z",
              },
            ],
          },
        },
      }),
    } as unknown as AtlassianClient;

    const mockNotifications = { create: vi.fn() };
    const mockDb = {
      issues: {
        getById: vi.fn().mockReturnValue(issue),
        update: vi.fn(),
      },
    };

    const monitor = createJiraCommentMonitor(mockClient, 30_000, mockDb as any);

    const ctx: MonitorContext = {
      issueId: "issue-123",
      hooks: { emit: vi.fn() } as any,
      memory: { notifications: mockNotifications } as any,
      config: {} as any,
    };

    const result = await monitor.poll(ctx);
    expect(result.hasChanges).toBe(true);
    expect(mockNotifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId: "issue-123",
        source: "jira",
        sourceId: "jira-comment-10001",
        title: "New comment from Alice",
        body: "New comment",
      }),
    );
  });

  it("deduplicates already-seen comments", async () => {
    const issue = {
      id: "issue-123",
      externalId: "AM-123",
      source: "jira",
      title: "Test",
      description: "",
      status: "pending",
      issueType: "task",
      url: null,
      assignee: null,
      labels: null,
      worktreePath: null,
      prUrl: null,
      prNumber: null,
      metadata: { jira_last_seen_comment_ids: ["10001"] },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Issue;

    const mockClient = {
      fetchIssue: vi.fn().mockResolvedValue({
        key: "AM-123",
        fields: {
          comment: {
            comments: [
              {
                id: "10001",
                author: { displayName: "Alice", accountId: "abc" },
                body: "Already seen",
                created: "2024-01-01T10:00:00Z",
                updated: "2024-01-01T10:00:00Z",
              },
            ],
          },
        },
      }),
    } as unknown as AtlassianClient;

    const mockNotifications = { create: vi.fn() };
    const mockDb = {
      issues: {
        getById: vi.fn().mockReturnValue(issue),
        update: vi.fn(),
      },
    };

    const monitor = createJiraCommentMonitor(mockClient, 30_000, mockDb as any);

    const ctx: MonitorContext = {
      issueId: "issue-123",
      hooks: { emit: vi.fn() } as any,
      memory: { notifications: mockNotifications } as any,
      config: {} as any,
    };

    const result = await monitor.poll(ctx);
    expect(result.hasChanges).toBe(false);
    expect(mockNotifications.create).not.toHaveBeenCalled();
  });
});
