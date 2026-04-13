/**
 * Tests for mapIssueResponse function
 */

import { describe, it, expect } from "bun:test";
import { mapIssueResponse } from "./map-issue.ts";
import type { GetJiraIssueResponse } from "./types.ts";

describe("mapIssueResponse", () => {
  const cloudId = "test.atlassian.net";

  const baseResponse: GetJiraIssueResponse = {
    key: "TEST-123",
    self: "https://test.atlassian.net/rest/api/2/issue/123",
    fields: {
      summary: "Test ticket summary",
      description: "Test description",
      status: { name: "In Progress" },
      priority: { name: "High" },
      assignee: { displayName: "John Doe" },
      reporter: { displayName: "Jane Smith" },
      issuetype: { name: "Bug" },
      project: { key: "TEST" },
      created: "2024-01-15T10:00:00.000Z",
      updated: "2024-01-16T14:30:00.000Z",
    },
  };

  it("should map complete response correctly", () => {
    const result = mapIssueResponse(baseResponse, cloudId);

    expect(result.key).toBe("TEST-123");
    expect(result.summary).toBe("Test ticket summary");
    expect(result.description).toBe("Test description");
    expect(result.status).toBe("In Progress");
    expect(result.priority).toBe("High");
    expect(result.assignee).toBe("John Doe");
    expect(result.reporter).toBe("Jane Smith");
    expect(result.issueType).toBe("Bug");
    expect(result.url).toBe("https://test.atlassian.net/browse/TEST-123");
    expect(result.projectKey).toBe("TEST");
    expect(result.created).toBe("2024-01-15T10:00:00.000Z");
    expect(result.updated).toBe("2024-01-16T14:30:00.000Z");
  });

  it("should throw error when fields is missing", () => {
    const invalidResponse = { key: "TEST-123", self: "" } as unknown as GetJiraIssueResponse;

    expect(() => mapIssueResponse(invalidResponse, cloudId)).toThrow(
      "Invalid Jira response: missing 'fields' object",
    );
  });

  it("should throw error when key is missing", () => {
    const invalidResponse = {
      self: "",
      fields: { summary: "Test" },
    } as unknown as GetJiraIssueResponse;

    expect(() => mapIssueResponse(invalidResponse, cloudId)).toThrow(
      "Invalid Jira response: missing 'key' field",
    );
  });

  it("should use empty string for missing summary", () => {
    const response = {
      ...baseResponse,
      fields: { ...baseResponse.fields, summary: "" },
    };

    const result = mapIssueResponse(response, cloudId);
    expect(result.summary).toBe("");
  });

  it("should use null for missing description", () => {
    const response = {
      ...baseResponse,
      fields: { ...baseResponse.fields, description: undefined },
    };

    const result = mapIssueResponse(response, cloudId);
    expect(result.description).toBeNull();
  });

  it("should use 'Unknown' for missing status name", () => {
    const response = {
      ...baseResponse,
      fields: { ...baseResponse.fields, status: { name: "" } },
    };

    const result = mapIssueResponse(response, cloudId);
    expect(result.status).toBe("");
  });

  it("should use null for missing priority", () => {
    const response = {
      ...baseResponse,
      fields: { ...baseResponse.fields, priority: undefined },
    };

    const result = mapIssueResponse(response, cloudId);
    expect(result.priority).toBeNull();
  });

  it("should use null for missing assignee", () => {
    const response = {
      ...baseResponse,
      fields: { ...baseResponse.fields, assignee: undefined },
    };

    const result = mapIssueResponse(response, cloudId);
    expect(result.assignee).toBeNull();
  });

  it("should use null for missing reporter", () => {
    const response = {
      ...baseResponse,
      fields: { ...baseResponse.fields, reporter: undefined },
    };

    const result = mapIssueResponse(response, cloudId);
    expect(result.reporter).toBeNull();
  });

  it("should use 'Unknown' for missing issue type name", () => {
    const response = {
      ...baseResponse,
      fields: { ...baseResponse.fields, issuetype: { name: "" } },
    };

    const result = mapIssueResponse(response, cloudId);
    expect(result.issueType).toBe("");
  });

  it("should use empty string for missing project key", () => {
    const response = {
      ...baseResponse,
      fields: { ...baseResponse.fields, project: { key: "" } },
    };

    const result = mapIssueResponse(response, cloudId);
    expect(result.projectKey).toBe("");
  });

  it("should use provided empty created date string", () => {
    const response = {
      ...baseResponse,
      fields: { ...baseResponse.fields, created: "" },
    };

    const result = mapIssueResponse(response, cloudId);
    // Empty string is not null/undefined, so it's used as-is (not replaced with new Date())
    expect(result.created).toBe("");
  });

  it("should use provided empty updated date string", () => {
    const response = {
      ...baseResponse,
      fields: { ...baseResponse.fields, updated: "" },
    };

    const result = mapIssueResponse(response, cloudId);
    // Empty string is not null/undefined, so it's used as-is (not replaced with new Date())
    expect(result.updated).toBe("");
  });

  it("should construct correct URL with different cloud IDs", () => {
    const result1 = mapIssueResponse(baseResponse, "company.atlassian.net");
    expect(result1.url).toBe("https://company.atlassian.net/browse/TEST-123");

    const result2 = mapIssueResponse(baseResponse, "jira.mycompany.com");
    expect(result2.url).toBe("https://jira.mycompany.com/browse/TEST-123");
  });

  it("should handle nested field values correctly", () => {
    const response: GetJiraIssueResponse = {
      key: "PROJ-456",
      self: "https://test.atlassian.net/rest/api/2/issue/456",
      fields: {
        summary: "Another ticket",
        description: null,
        status: { name: "Done" },
        priority: { name: "Low" },
        assignee: { displayName: "Bob Wilson" },
        reporter: { displayName: "Alice Brown" },
        issuetype: { name: "Task" },
        project: { key: "PROJ" },
        created: "2023-06-01T08:00:00.000Z",
        updated: "2023-06-02T16:45:00.000Z",
      },
    };

    const result = mapIssueResponse(response, cloudId);

    expect(result.key).toBe("PROJ-456");
    expect(result.status).toBe("Done");
    expect(result.priority).toBe("Low");
    expect(result.issueType).toBe("Task");
    expect(result.assignee).toBe("Bob Wilson");
    expect(result.reporter).toBe("Alice Brown");
  });

  it("should handle null description", () => {
    const response = {
      ...baseResponse,
      fields: { ...baseResponse.fields, description: null },
    };

    const result = mapIssueResponse(response, cloudId);
    expect(result.description).toBeNull();
  });

  it("should handle null priority", () => {
    const response = {
      ...baseResponse,
      fields: { ...baseResponse.fields, priority: null },
    };

    const result = mapIssueResponse(response, cloudId);
    expect(result.priority).toBeNull();
  });

  it("should handle null assignee", () => {
    const response = {
      ...baseResponse,
      fields: { ...baseResponse.fields, assignee: null },
    };

    const result = mapIssueResponse(response, cloudId);
    expect(result.assignee).toBeNull();
  });

  it("should handle null reporter", () => {
    const response = {
      ...baseResponse,
      fields: { ...baseResponse.fields, reporter: null },
    };

    const result = mapIssueResponse(response, cloudId);
    expect(result.reporter).toBeNull();
  });
});
