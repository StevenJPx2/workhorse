/**
 * Edge case tests for AtlassianClient
 *
 * Tests error conditions, reconnection, and malformed responses.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { createAtlassianClient } from "../client.ts";

// Mock MCP SDK with configurable responses
const mockConnect = mock(() => Promise.resolve());
const mockClose = mock(() => Promise.resolve());
const mockCallTool = mock(() =>
  Promise.resolve({ content: [] as Array<{ type: string; text: string }> }),
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

describe("AtlassianClient Edge Cases", () => {
  beforeEach(() => {
    mockConnect.mockClear();
    mockClose.mockClear();
    mockCallTool.mockClear();
  });

  describe("reconnection", () => {
    it("should reconnect after disconnect", async () => {
      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });

      // First connection
      await client.connect();
      expect(client.isConnected).toBe(true);

      // Disconnect
      await client.disconnect();
      expect(client.isConnected).toBe(false);

      // Reconnect
      await client.connect();
      expect(client.isConnected).toBe(true);
      expect(mockConnect).toHaveBeenCalledTimes(2);
    });

    it("should handle connect errors without corrupting state", async () => {
      // First call succeeds, second fails
      mockConnect.mockResolvedValueOnce().mockRejectedValueOnce(new Error("Connection refused"));

      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });

      // First connect works
      await client.connect();
      expect(client.isConnected).toBe(true);

      // Disconnect
      await client.disconnect();

      // Second connect fails
      await expect(client.connect()).rejects.toThrow("Connection refused");
      expect(client.isConnected).toBe(false);
    });
  });

  describe("malformed responses", () => {
    it("should throw on null content", async () => {
      mockCallTool.mockResolvedValueOnce({ content: null as any });

      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });
      await client.connect();

      await expect(client.fetchIssue("TEST-123")).rejects.toThrow(
        "No data returned for issue TEST-123",
      );
    });

    it("should throw on content without text type", async () => {
      mockCallTool.mockResolvedValueOnce({
        content: [{ type: "image", text: "base64..." } as any],
      });

      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });
      await client.connect();

      await expect(client.fetchIssue("TEST-123")).rejects.toThrow(
        "Unexpected response format for issue TEST-123",
      );
    });

    it("should throw on empty text", async () => {
      mockCallTool.mockResolvedValueOnce({
        content: [{ type: "text", text: "" }],
      });

      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });
      await client.connect();

      await expect(client.fetchIssue("TEST-123")).rejects.toThrow(
        "Failed to parse Jira response for TEST-123: ",
      );
    });

    it("should throw on whitespace-only text", async () => {
      mockCallTool.mockResolvedValueOnce({
        content: [{ type: "text", text: "   \n\t  " }],
      });

      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });
      await client.connect();

      await expect(client.fetchIssue("TEST-123")).rejects.toThrow();
    });

    it("should include partial response in error for long responses", async () => {
      const longResponse = "x".repeat(500);
      mockCallTool.mockResolvedValueOnce({
        content: [{ type: "text", text: longResponse }],
      });

      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });
      await client.connect();

      await expect(client.fetchIssue("TEST-123")).rejects.toThrow("...");
    });
  });

  describe("missing required fields", () => {
    it("should throw when status is missing", async () => {
      const response = {
        key: "TEST-1",
        fields: {
          summary: "Test",
          description: null,
          // status is missing!
          priority: null,
          assignee: null,
          reporter: null,
          issuetype: { name: "Task" },
          project: { key: "TEST" },
          created: "2024-01-01T00:00:00Z",
          updated: "2024-01-01T00:00:00Z",
        },
        self: "https://test.atlassian.net/rest/api/3/issue/TEST-1",
      };

      mockCallTool.mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify(response) }],
      });

      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });
      await client.connect();

      // Should throw - status is required by Jira API
      await expect(client.fetchIssue("TEST-1")).rejects.toThrow();
    });

    it("should throw when issuetype is missing", async () => {
      const response = {
        key: "TEST-1",
        fields: {
          summary: "Test",
          description: null,
          status: { name: "Open" },
          priority: null,
          assignee: null,
          reporter: null,
          // issuetype is missing!
          project: { key: "TEST" },
          created: "2024-01-01T00:00:00Z",
          updated: "2024-01-01T00:00:00Z",
        },
        self: "https://test.atlassian.net/rest/api/3/issue/TEST-1",
      };

      mockCallTool.mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify(response) }],
      });

      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });
      await client.connect();

      // Should throw - issuetype is required
      await expect(client.fetchIssue("TEST-1")).rejects.toThrow();
    });
  });

  describe("MCP error scenarios", () => {
    it("should propagate MCP call errors", async () => {
      mockCallTool.mockRejectedValueOnce(new Error("MCP server unavailable"));

      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });
      await client.connect();

      await expect(client.fetchIssue("TEST-123")).rejects.toThrow("MCP server unavailable");
    });

    it("should handle network timeouts", async () => {
      mockCallTool.mockRejectedValueOnce(new Error("Request timeout"));

      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });
      await client.connect();

      await expect(client.addComment("TEST-123", "comment")).rejects.toThrow("Request timeout");
    });

    it("should handle authentication errors", async () => {
      mockCallTool.mockRejectedValueOnce(new Error("Authentication failed: Invalid credentials"));

      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });
      await client.connect();

      await expect(client.transitionIssue("TEST-123", "21")).rejects.toThrow(
        "Authentication failed",
      );
    });
  });

  describe("concurrent operations", () => {
    it("should handle multiple fetchIssue calls concurrently", async () => {
      const responses = [
        {
          key: "TEST-1",
          fields: {
            summary: "Issue 1",
            description: null,
            status: { name: "Open" },
            priority: null,
            assignee: null,
            reporter: null,
            issuetype: { name: "Task" },
            project: { key: "TEST" },
            created: "2024-01-01T00:00:00Z",
            updated: "2024-01-01T00:00:00Z",
          },
          self: "https://test.atlassian.net/rest/api/3/issue/TEST-1",
        },
        {
          key: "TEST-2",
          fields: {
            summary: "Issue 2",
            description: null,
            status: { name: "Done" },
            priority: null,
            assignee: null,
            reporter: null,
            issuetype: { name: "Bug" },
            project: { key: "TEST" },
            created: "2024-01-01T00:00:00Z",
            updated: "2024-01-01T00:00:00Z",
          },
          self: "https://test.atlassian.net/rest/api/3/issue/TEST-2",
        },
      ];

      // Set up sequential responses
      mockCallTool
        .mockResolvedValueOnce({
          content: [{ type: "text", text: JSON.stringify(responses[0]) }],
        })
        .mockResolvedValueOnce({
          content: [{ type: "text", text: JSON.stringify(responses[1]) }],
        });

      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });
      await client.connect();

      // Run concurrently
      const [issue1, issue2] = await Promise.all([
        client.fetchIssue("TEST-1"),
        client.fetchIssue("TEST-2"),
      ]);

      expect(issue1.key).toBe("TEST-1");
      expect(issue2.key).toBe("TEST-2");
    });
  });
});
