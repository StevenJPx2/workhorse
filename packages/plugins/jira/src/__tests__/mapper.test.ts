/**
 * Tests for Jira → ParsedIssue mapper.
 */

import { describe, expect, it } from "vitest";

import { mapJiraComment, mapJiraToIssue } from "../mapper.ts";
import type { JiraComment, JiraIssue } from "../types.ts";

describe("mapJiraToIssue", () => {
  it("maps a full Jira issue to ParsedIssue", () => {
    const jiraIssue: JiraIssue = {
      key: "AM-123",
      self: "https://test.atlassian.net/rest/api/3/issue/AM-123",
      fields: {
        summary: "Add dark mode",
        description: "Users want dark mode for the UI.",
        status: { name: "In Progress", id: "3" },
        priority: { name: "High", id: "2" },
        assignee: { displayName: "Alice", accountId: "abc123" },
        reporter: { displayName: "Bob", accountId: "def456" },
        issuetype: { name: "Story" },
        labels: ["frontend", "ui"],
        comment: {
          comments: [
            {
              id: "10001",
              author: { displayName: "Alice", accountId: "abc123" },
              body: "Working on this now.",
              created: "2024-01-01T10:00:00.000Z",
              updated: "2024-01-01T10:00:00.000Z",
            },
          ],
          total: 1,
        },
        created: "2024-01-01T00:00:00.000Z",
        updated: "2024-01-02T00:00:00.000Z",
      },
    };

    const parsed = mapJiraToIssue(jiraIssue);

    expect(parsed.externalId).toBe("AM-123");
    expect(parsed.source).toBe("jira");
    expect(parsed.title).toBe("Add dark mode");
    expect(parsed.description).toBe("Users want dark mode for the UI.");
    expect(parsed.issueType).toBe("story");
    expect(parsed.url).toBe("https://test.atlassian.net/browse/AM-123");
    expect(parsed.assignee).toBe("Alice");
    expect(parsed.labels).toEqual(["frontend", "ui"]);
    expect(parsed.metadata.priority).toBe("High");
    expect(parsed.metadata.status).toBe("In Progress");
    expect(parsed.metadata.comments).toHaveLength(1);
  });

  it("handles missing optional fields gracefully", () => {
    const jiraIssue: JiraIssue = {
      key: "AM-456",
      self: "https://test.atlassian.net/rest/api/3/issue/AM-456",
      fields: {
        summary: "Fix bug",
        status: { name: "To Do", id: "1" },
      },
    };

    const parsed = mapJiraToIssue(jiraIssue);

    expect(parsed.externalId).toBe("AM-456");
    expect(parsed.title).toBe("Fix bug");
    expect(parsed.description).toBe("");
    expect(parsed.assignee).toBeUndefined();
    expect(parsed.labels).toEqual([]);
    expect(parsed.metadata.priority).toBeUndefined();
    expect(parsed.metadata.comments).toEqual([]);
  });

  it("extracts text from Atlassian Document Format description", () => {
    const jiraIssue: JiraIssue = {
      key: "AM-789",
      self: "https://test.atlassian.net/rest/api/3/issue/AM-789",
      fields: {
        summary: "Test ADF",
        description: {
          content: [{ text: "Line 1" }, { content: [{ text: "Line 2" }] }],
        } as unknown as string,
        status: { name: "To Do", id: "1" },
      },
    };

    const parsed = mapJiraToIssue(jiraIssue);
    expect(parsed.description).toContain("Line 1");
    expect(parsed.description).toContain("Line 2");
  });
});

describe("mapJiraComment", () => {
  it("maps a comment to a plain object", () => {
    const comment: JiraComment = {
      id: "10001",
      author: { displayName: "Alice", accountId: "abc123" },
      body: "Looks good!",
      created: "2024-01-01T10:00:00.000Z",
      updated: "2024-01-01T10:00:00.000Z",
    };

    const mapped = mapJiraComment(comment);
    expect(mapped.id).toBe("10001");
    expect(mapped.author).toBe("Alice");
    expect(mapped.body).toBe("Looks good!");
  });
});
