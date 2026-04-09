/**
 * Tests for useAtlassian hook
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { createRoot } from "solid-js";
import { useAtlassian } from "../use-atlassian.ts";

// Mock MCP SDK
const mockConnect = mock(() => Promise.resolve());
const mockClose = mock(() => Promise.resolve());
const mockCallTool = mock(
  () =>
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

describe("useAtlassian", () => {
  beforeEach(() => {
    mockConnect.mockClear();
    mockClose.mockClear();
    mockCallTool.mockClear();
  });

  describe("initialization", () => {
    it("should start disconnected", () => {
      createRoot((dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });
        expect(atlassian.isConnected()).toBe(false);
        expect(atlassian.isConnecting()).toBe(false);
        expect(atlassian.error()).toBe(null);
        dispose();
      });
    });

    it("should auto-connect when autoConnect is true", async () => {
      await createRoot(async (dispose) => {
        // Hook called for side-effect of auto-connect
        useAtlassian({
          cloudId: "test.atlassian.net",
          autoConnect: true,
        });

        // Wait for auto-connect to complete
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(mockConnect).toHaveBeenCalled();
        dispose();
      });
    });

    it("should not auto-connect without cloudId", () => {
      createRoot((dispose) => {
        const atlassian = useAtlassian({ autoConnect: true });
        expect(atlassian.isConnected()).toBe(false);
        expect(mockConnect).not.toHaveBeenCalled();
        dispose();
      });
    });
  });

  describe("connect", () => {
    it("should connect successfully", async () => {
      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });

        await atlassian.connect();

        expect(atlassian.isConnected()).toBe(true);
        expect(atlassian.isConnecting()).toBe(false);
        expect(mockConnect).toHaveBeenCalled();
        dispose();
      });
    });

    it("should not connect twice", async () => {
      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });

        await atlassian.connect();
        await atlassian.connect();

        expect(mockConnect).toHaveBeenCalledTimes(1);
        dispose();
      });
    });

    it("should throw helpful error without cloudId", async () => {
      await createRoot(async (dispose) => {
        const atlassian = useAtlassian();

        await expect(atlassian.connect()).rejects.toThrow(
          "Jira cloud ID is not configured"
        );
        dispose();
      });
    });

    it("should call onConnectionChange callback", async () => {
      await createRoot(async (dispose) => {
        const onConnectionChange = mock(() => {});
        const atlassian = useAtlassian({
          cloudId: "test.atlassian.net",
          onConnectionChange,
        });

        await atlassian.connect();

        expect(onConnectionChange).toHaveBeenCalledWith(true);
        dispose();
      });
    });
  });

  describe("disconnect", () => {
    it("should disconnect successfully", async () => {
      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });

        await atlassian.connect();
        await atlassian.disconnect();

        expect(atlassian.isConnected()).toBe(false);
        expect(mockClose).toHaveBeenCalled();
        dispose();
      });
    });

    it("should not disconnect when not connected", async () => {
      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });

        await atlassian.disconnect();

        expect(mockClose).not.toHaveBeenCalled();
        dispose();
      });
    });
  });

  describe("fetchIssue", () => {
    it("should fetch and map issue correctly", async () => {
      const mockIssueResponse = {
        key: "AM-123",
        fields: {
          summary: "Test issue",
          description: "Test description",
          status: { name: "In Progress" },
          priority: { name: "High" },
          assignee: { displayName: "John Doe" },
          reporter: { displayName: "Jane Doe" },
          issuetype: { name: "Bug" },
          project: { key: "AM" },
          created: "2024-01-01T00:00:00Z",
          updated: "2024-01-02T00:00:00Z",
        },
        self: "https://test.atlassian.net/rest/api/3/issue/AM-123",
      };

      mockCallTool.mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify(mockIssueResponse) }],
      });

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });
        const issue = await atlassian.fetchIssue("AM-123");

        expect(issue.key).toBe("AM-123");
        expect(issue.summary).toBe("Test issue");
        expect(issue.description).toBe("Test description");
        expect(issue.status).toBe("In Progress");
        expect(issue.priority).toBe("High");
        expect(issue.assignee).toBe("John Doe");
        expect(issue.reporter).toBe("Jane Doe");
        expect(issue.issueType).toBe("Bug");
        expect(issue.projectKey).toBe("AM");
        expect(issue.url).toBe("https://test.atlassian.net/browse/AM-123");

        expect(mockCallTool).toHaveBeenCalledWith({
          name: "getJiraIssue",
          arguments: { cloudId: "test.atlassian.net", issueIdOrKey: "AM-123" },
        });

        dispose();
      });
    });

    it("should handle null optional fields", async () => {
      const mockIssueResponse = {
        key: "AM-456",
        fields: {
          summary: "Minimal issue",
          description: null,
          status: { name: "Open" },
          priority: null,
          assignee: null,
          reporter: null,
          issuetype: { name: "Task" },
          project: { key: "AM" },
          created: "2024-01-01T00:00:00Z",
          updated: "2024-01-02T00:00:00Z",
        },
        self: "https://test.atlassian.net/rest/api/3/issue/AM-456",
      };

      mockCallTool.mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify(mockIssueResponse) }],
      });

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });
        const issue = await atlassian.fetchIssue("AM-456");

        expect(issue.description).toBe(null);
        expect(issue.priority).toBe(null);
        expect(issue.assignee).toBe(null);
        expect(issue.reporter).toBe(null);

        dispose();
      });
    });

    it("should throw on empty response", async () => {
      mockCallTool.mockResolvedValueOnce({ content: [] });

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });

        await expect(atlassian.fetchIssue("AM-999")).rejects.toThrow(
          "No data returned for issue AM-999"
        );

        dispose();
      });
    });
  });

  describe("addComment", () => {
    it("should add comment to issue", async () => {
      mockCallTool.mockResolvedValueOnce({ content: [] });

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });
        await atlassian.addComment("AM-123", "Test comment");

        expect(mockCallTool).toHaveBeenCalledWith({
          name: "addCommentToJiraIssue",
          arguments: {
            cloudId: "test.atlassian.net",
            issueIdOrKey: "AM-123",
            commentBody: "Test comment",
          },
        });

        dispose();
      });
    });
  });

  describe("transitionIssue", () => {
    it("should transition issue", async () => {
      mockCallTool.mockResolvedValueOnce({ content: [] });

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });
        await atlassian.transitionIssue("AM-123", "21");

        expect(mockCallTool).toHaveBeenCalledWith({
          name: "transitionJiraIssue",
          arguments: {
            cloudId: "test.atlassian.net",
            issueIdOrKey: "AM-123",
            transition: { id: "21" },
          },
        });

        dispose();
      });
    });
  });

  describe("error handling", () => {
    it("should capture errors in state", async () => {
      const errorMessage = "Connection failed";
      mockConnect.mockRejectedValueOnce(new Error(errorMessage));

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });

        await expect(atlassian.connect()).rejects.toThrow(errorMessage);
        expect(atlassian.error()?.message).toBe(errorMessage);

        dispose();
      });
    });

    it("should call onError callback", async () => {
      const errorMessage = "Connection failed";
      mockConnect.mockRejectedValueOnce(new Error(errorMessage));

      await createRoot(async (dispose) => {
        const onError = mock(() => {});
        const atlassian = useAtlassian({
          cloudId: "test.atlassian.net",
          onError,
        });

        await expect(atlassian.connect()).rejects.toThrow();
        expect(onError).toHaveBeenCalledWith(expect.any(Error));

        dispose();
      });
    });
  });
});
