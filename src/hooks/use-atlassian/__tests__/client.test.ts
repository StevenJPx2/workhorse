/**
 * Tests for AtlassianClient
 *
 * Tests the MCP client wrapper for Jira API calls.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { AtlassianClient, createAtlassianClient } from "../client.ts";

// Mock MCP SDK
const mockConnect = mock(() => Promise.resolve());
const mockClose = mock(() => Promise.resolve());
const mockCallTool = mock(
  (_args: { name: string; arguments: Record<string, unknown> }) =>
    Promise.resolve({
      content: [] as Array<{ type: string; text: string }>,
    })
);

mock.module("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class MockClient {
    connect = mockConnect;
    close = mockClose;
    callTool = mockCallTool;
  },
}));

mock.module("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: class MockTransport {
    constructor() {}
  },
}));

describe("AtlassianClient", () => {
  beforeEach(() => {
    mockConnect.mockClear();
    mockClose.mockClear();
    mockCallTool.mockClear();
  });

  describe("createAtlassianClient", () => {
    it("should create a client instance", () => {
      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });
      expect(client).toBeInstanceOf(AtlassianClient);
    });
  });

  describe("connect", () => {
    it("should connect to MCP server", async () => {
      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });
      await client.connect();

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(client.isConnected).toBe(true);
    });

    it("should not connect twice", async () => {
      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });
      await client.connect();
      await client.connect();

      expect(mockConnect).toHaveBeenCalledTimes(1);
    });
  });

  describe("disconnect", () => {
    it("should disconnect from MCP server", async () => {
      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });
      await client.connect();
      await client.disconnect();

      expect(mockClose).toHaveBeenCalledTimes(1);
      expect(client.isConnected).toBe(false);
    });

    it("should not disconnect when not connected", async () => {
      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });
      await client.disconnect();

      expect(mockClose).not.toHaveBeenCalled();
    });
  });

  describe("fetchIssue", () => {
    it("should call getJiraIssue with correct parameters", async () => {
      const mockIssueResponse = {
        key: "ADEPT-123",
        fields: {
          summary: "Test issue",
          description: "Test description",
          status: { name: "Open" },
          priority: { name: "High" },
          assignee: { displayName: "John Doe" },
          reporter: { displayName: "Jane Doe" },
          issuetype: { name: "Bug" },
          project: { key: "ADEPT" },
          created: "2024-01-01T00:00:00Z",
          updated: "2024-01-02T00:00:00Z",
        },
        self: "https://adeptmind.atlassian.net/rest/api/3/issue/ADEPT-123",
      };

      mockCallTool.mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify(mockIssueResponse) }],
      });

      const client = createAtlassianClient({
        cloudId: "adeptmind.atlassian.net",
      });
      await client.connect();
      const issue = await client.fetchIssue("ADEPT-123");

      // Verify correct API parameters
      expect(mockCallTool).toHaveBeenCalledWith({
        name: "getJiraIssue",
        arguments: {
          cloudId: "adeptmind.atlassian.net",
          issueIdOrKey: "ADEPT-123",
        },
      });

      // Verify response mapping
      expect(issue.key).toBe("ADEPT-123");
      expect(issue.summary).toBe("Test issue");
      expect(issue.description).toBe("Test description");
      expect(issue.status).toBe("Open");
      expect(issue.priority).toBe("High");
      expect(issue.assignee).toBe("John Doe");
      expect(issue.reporter).toBe("Jane Doe");
      expect(issue.issueType).toBe("Bug");
      expect(issue.projectKey).toBe("ADEPT");
      expect(issue.url).toBe(
        "https://adeptmind.atlassian.net/browse/ADEPT-123"
      );
    });

    it("should handle null optional fields", async () => {
      const mockIssueResponse = {
        key: "ADEPT-456",
        fields: {
          summary: "Minimal issue",
          description: null,
          status: { name: "Open" },
          priority: null,
          assignee: null,
          reporter: null,
          issuetype: { name: "Task" },
          project: { key: "ADEPT" },
          created: "2024-01-01T00:00:00Z",
          updated: "2024-01-02T00:00:00Z",
        },
        self: "https://adeptmind.atlassian.net/rest/api/3/issue/ADEPT-456",
      };

      mockCallTool.mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify(mockIssueResponse) }],
      });

      const client = createAtlassianClient({
        cloudId: "adeptmind.atlassian.net",
      });
      await client.connect();
      const issue = await client.fetchIssue("ADEPT-456");

      expect(issue.description).toBe(null);
      expect(issue.priority).toBe(null);
      expect(issue.assignee).toBe(null);
      expect(issue.reporter).toBe(null);
    });

    it("should throw on empty response", async () => {
      mockCallTool.mockResolvedValueOnce({ content: [] });

      const client = createAtlassianClient({
        cloudId: "adeptmind.atlassian.net",
      });
      await client.connect();

      await expect(client.fetchIssue("ADEPT-999")).rejects.toThrow(
        "No data returned for issue ADEPT-999"
      );
    });

    it("should throw helpful error on invalid JSON response", async () => {
      mockCallTool.mockResolvedValueOnce({
        content: [{ type: "text", text: "MCP Error: Something went wrong" }],
      });

      const client = createAtlassianClient({
        cloudId: "adeptmind.atlassian.net",
      });
      await client.connect();

      await expect(client.fetchIssue("ADEPT-123")).rejects.toThrow(
        "Failed to parse Jira response for ADEPT-123: MCP Error: Something went wrong"
      );
    });

    it("should throw when not connected", async () => {
      const client = createAtlassianClient({
        cloudId: "adeptmind.atlassian.net",
      });

      await expect(client.fetchIssue("ADEPT-123")).rejects.toThrow(
        "Not connected to Atlassian MCP"
      );
    });
  });

  describe("addComment", () => {
    it("should call addCommentToJiraIssue with correct parameters", async () => {
      mockCallTool.mockResolvedValueOnce({ content: [] });

      const client = createAtlassianClient({
        cloudId: "adeptmind.atlassian.net",
      });
      await client.connect();
      await client.addComment("ADEPT-123", "This is a test comment");

      expect(mockCallTool).toHaveBeenCalledWith({
        name: "addCommentToJiraIssue",
        arguments: {
          cloudId: "adeptmind.atlassian.net",
          issueIdOrKey: "ADEPT-123",
          commentBody: "This is a test comment",
        },
      });
    });
  });

  describe("transitionIssue", () => {
    it("should call transitionJiraIssue with correct parameters", async () => {
      mockCallTool.mockResolvedValueOnce({ content: [] });

      const client = createAtlassianClient({
        cloudId: "adeptmind.atlassian.net",
      });
      await client.connect();
      await client.transitionIssue("ADEPT-123", "21");

      expect(mockCallTool).toHaveBeenCalledWith({
        name: "transitionJiraIssue",
        arguments: {
          cloudId: "adeptmind.atlassian.net",
          issueIdOrKey: "ADEPT-123",
          transition: { id: "21" },
        },
      });
    });
  });
});
