/**
 * Tests for Jira tools.
 */

import { describe, expect, it, vi } from "vitest";
import type { AtlassianClient } from "../client.ts";
import { createJiraTools } from "../tools.ts";

/** Mock hooks emitter for testing */
const mockHooks = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  all: new Map(),
} as unknown as Parameters<typeof createJiraTools>[1];

describe("createJiraTools", () => {
  it("returns all three tools", () => {
    const mockClient = {} as AtlassianClient;
    const tools = createJiraTools(mockClient, mockHooks);
    expect(tools).toHaveLength(3);
    expect(tools[0]!.name).toBe("jira_add_comment");
    expect(tools[1]!.name).toBe("jira_transition_issue");
    expect(tools[2]!.name).toBe("jira_get_comments");
  });
});

describe("jira_add_comment tool", () => {
  it("adds a comment successfully", async () => {
    const mockClient = {
      addComment: vi.fn().mockResolvedValue(undefined),
    } as unknown as AtlassianClient;

    const tools = createJiraTools(mockClient, mockHooks);
    const addCommentTool = tools.find((t) => t.name === "jira_add_comment")!;

    const result = await addCommentTool.execute(
      { ticketKey: "AM-123", body: "LGTM" },
      {
        issueId: "AM-123",
        worktreePath: "/tmp",
        db: {} as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(mockClient.addComment).toHaveBeenCalledWith("AM-123", "LGTM", undefined);
    expect(result.success).toBe(true);
  });

  it("adds a reply comment successfully", async () => {
    const mockClient = {
      addComment: vi.fn().mockResolvedValue(undefined),
    } as unknown as AtlassianClient;

    const tools = createJiraTools(mockClient, mockHooks);
    const addCommentTool = tools.find((t) => t.name === "jira_add_comment")!;

    const result = await addCommentTool.execute(
      { ticketKey: "AM-123", body: "Thanks for the feedback!", replyToId: "10001" },
      {
        issueId: "AM-123",
        worktreePath: "/tmp",
        db: {} as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(mockClient.addComment).toHaveBeenCalledWith(
      "AM-123",
      "Thanks for the feedback!",
      "10001",
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain("reply to comment 10001");
  });

  it("returns error on failure", async () => {
    const mockClient = {
      addComment: vi.fn().mockRejectedValue(new Error("Network error")),
    } as unknown as AtlassianClient;

    const tools = createJiraTools(mockClient, mockHooks);
    const addCommentTool = tools.find((t) => t.name === "jira_add_comment")!;

    const result = await addCommentTool.execute(
      { ticketKey: "AM-123", body: "LGTM" },
      {
        issueId: "AM-123",
        worktreePath: "/tmp",
        db: {} as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Network error");
  });
});

describe("jira_transition_issue tool", () => {
  it("transitions an issue successfully", async () => {
    const mockClient = {
      fetchIssue: vi.fn().mockResolvedValue({
        key: "AM-123",
        fields: { status: { name: "To Do", id: "1" } },
      }),
      getTransitions: vi.fn().mockResolvedValue([
        { id: "31", name: "In Progress", to: { name: "In Progress", id: "3" } },
        { id: "41", name: "Done", to: { name: "Done", id: "6" } },
      ]),
      transitionIssue: vi.fn().mockResolvedValue(undefined),
    } as unknown as AtlassianClient;

    const tools = createJiraTools(mockClient, mockHooks);
    const transitionTool = tools.find((t) => t.name === "jira_transition_issue")!;

    const result = await transitionTool.execute(
      { ticketKey: "AM-123", status: "Done" },
      {
        issueId: "AM-123",
        worktreePath: "/tmp",
        db: {} as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(mockClient.getTransitions).toHaveBeenCalledWith("AM-123");
    expect(mockClient.transitionIssue).toHaveBeenCalledWith("AM-123", "41");
    expect(result.success).toBe(true);
    expect(result.output).toContain("Done");
  });

  it("returns error when no matching transition found", async () => {
    const mockClient = {
      fetchIssue: vi.fn().mockResolvedValue({
        key: "AM-123",
        fields: { status: { name: "To Do", id: "1" } },
      }),
      getTransitions: vi
        .fn()
        .mockResolvedValue([
          { id: "31", name: "In Progress", to: { name: "In Progress", id: "3" } },
        ]),
      transitionIssue: vi.fn(),
    } as unknown as AtlassianClient;

    const tools = createJiraTools(mockClient, mockHooks);
    const transitionTool = tools.find((t) => t.name === "jira_transition_issue")!;

    const result = await transitionTool.execute(
      { ticketKey: "AM-123", status: "Blocked" },
      {
        issueId: "AM-123",
        worktreePath: "/tmp",
        db: {} as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("No transition found");
  });
});

describe("jira_get_comments tool", () => {
  it("returns comments with id and parentId for threading", async () => {
    const mockClient = {
      fetchIssue: vi.fn().mockResolvedValue({
        key: "AM-123",
        self: "https://test.atlassian.net/rest/api/3/issue/AM-123",
        fields: {
          summary: "Test",
          status: { name: "To Do", id: "1" },
          comment: {
            comments: [
              {
                id: "10001",
                author: { displayName: "Alice", accountId: "abc" },
                body: "First comment",
                created: "2024-01-01T10:00:00Z",
                updated: "2024-01-01T10:00:00Z",
              },
              {
                id: "10002",
                author: { displayName: "Bob", accountId: "def" },
                body: "Reply to first",
                created: "2024-01-02T10:00:00Z",
                updated: "2024-01-02T10:00:00Z",
                parentId: "10001",
              },
            ],
          },
        },
      }),
    } as unknown as AtlassianClient;

    const tools = createJiraTools(mockClient, mockHooks);
    const getCommentsTool = tools.find((t) => t.name === "jira_get_comments")!;

    const result = await getCommentsTool.execute(
      { ticketKey: "AM-123" },
      {
        issueId: "AM-123",
        worktreePath: "/tmp",
        db: {} as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(mockClient.fetchIssue).toHaveBeenCalledWith("AM-123");
    expect(result.success).toBe(true);

    const comments = JSON.parse(result.output!);
    expect(comments).toHaveLength(2);
    expect(comments[0].id).toBe("10001");
    expect(comments[0].author).toBe("Alice");
    expect(comments[0].body).toBe("First comment");
    expect(comments[0].parentId).toBeUndefined();
    expect(comments[1].id).toBe("10002");
    expect(comments[1].author).toBe("Bob");
    expect(comments[1].parentId).toBe("10001");
  });

  it("returns empty array when no comments", async () => {
    const mockClient = {
      fetchIssue: vi.fn().mockResolvedValue({
        key: "AM-123",
        self: "https://test.atlassian.net/rest/api/3/issue/AM-123",
        fields: {
          summary: "Test",
          status: { name: "To Do", id: "1" },
        },
      }),
    } as unknown as AtlassianClient;

    const tools = createJiraTools(mockClient, mockHooks);
    const getCommentsTool = tools.find((t) => t.name === "jira_get_comments")!;

    const result = await getCommentsTool.execute(
      { ticketKey: "AM-123" },
      {
        issueId: "AM-123",
        worktreePath: "/tmp",
        db: {} as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(result.success).toBe(true);
    const comments = JSON.parse(result.output!);
    expect(comments).toEqual([]);
  });

  it("returns error on failure", async () => {
    const mockClient = {
      fetchIssue: vi.fn().mockRejectedValue(new Error("Issue not found")),
    } as unknown as AtlassianClient;

    const tools = createJiraTools(mockClient, mockHooks);
    const getCommentsTool = tools.find((t) => t.name === "jira_get_comments")!;

    const result = await getCommentsTool.execute(
      { ticketKey: "AM-999" },
      {
        issueId: "AM-999",
        worktreePath: "/tmp",
        db: {} as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Issue not found");
  });
});
