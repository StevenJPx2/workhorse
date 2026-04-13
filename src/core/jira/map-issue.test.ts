import { describe, test, expect } from "bun:test";
import { mapIssueResponse } from "./map-issue.ts";
import type { GetJiraIssueResponse } from "./types.ts";

describe("mapIssueResponse", () => {
  const cloudId = "company.atlassian.net";

  const validResponse: GetJiraIssueResponse = {
    key: "AM-123",
    self: "https://api.atlassian.com/...",
    fields: {
      summary: "Test issue",
      description: "A test description",
      status: { name: "Open" },
      priority: { name: "High" },
      assignee: { displayName: "John Doe" },
      reporter: { displayName: "Jane Doe" },
      issuetype: { name: "Bug" },
      project: { key: "AM" },
      created: "2024-01-01T00:00:00.000Z",
      updated: "2024-01-02T00:00:00.000Z",
    },
  };

  test("maps all fields correctly", () => {
    const result = mapIssueResponse(validResponse, cloudId);

    expect(result.key).toBe("AM-123");
    expect(result.summary).toBe("Test issue");
    expect(result.description).toBe("A test description");
    expect(result.status).toBe("Open");
    expect(result.priority).toBe("High");
    expect(result.assignee).toBe("John Doe");
    expect(result.reporter).toBe("Jane Doe");
    expect(result.issueType).toBe("Bug");
    expect(result.projectKey).toBe("AM");
    expect(result.url).toBe("https://company.atlassian.net/browse/AM-123");
    expect(result.created).toBe("2024-01-01T00:00:00.000Z");
    expect(result.updated).toBe("2024-01-02T00:00:00.000Z");
  });

  test("handles null/missing optional fields", () => {
    const response: GetJiraIssueResponse = {
      key: "AM-456",
      self: "...",
      fields: {
        summary: "Minimal issue",
        description: null,
        status: { name: "Todo" },
        issuetype: { name: "Task" },
        project: { key: "AM" },
        created: "2024-01-01T00:00:00.000Z",
        updated: "2024-01-01T00:00:00.000Z",
      },
    };

    const result = mapIssueResponse(response, cloudId);

    expect(result.description).toBeNull();
    expect(result.priority).toBeNull();
    expect(result.assignee).toBeNull();
    expect(result.reporter).toBeNull();
  });

  test("throws on missing fields object", () => {
    const invalidResponse = {
      key: "AM-123",
      self: "...",
    } as unknown as GetJiraIssueResponse;

    expect(() => mapIssueResponse(invalidResponse, cloudId)).toThrow(
      "Invalid Jira response: missing 'fields' object",
    );
  });

  test("throws on missing key", () => {
    const invalidResponse = {
      self: "...",
      fields: {
        summary: "Test",
        status: { name: "Open" },
        issuetype: { name: "Bug" },
        project: { key: "AM" },
        created: "2024-01-01T00:00:00.000Z",
        updated: "2024-01-01T00:00:00.000Z",
      },
    } as unknown as GetJiraIssueResponse;

    expect(() => mapIssueResponse(invalidResponse, cloudId)).toThrow(
      "Invalid Jira response: missing 'key' field",
    );
  });

  test("handles missing status gracefully", () => {
    const response: GetJiraIssueResponse = {
      key: "AM-789",
      self: "...",
      fields: {
        summary: "Test",
        status: undefined as any,
        issuetype: { name: "Bug" },
        project: { key: "AM" },
        created: "2024-01-01T00:00:00.000Z",
        updated: "2024-01-01T00:00:00.000Z",
      },
    };

    const result = mapIssueResponse(response, cloudId);
    expect(result.status).toBe("Unknown");
  });
});
