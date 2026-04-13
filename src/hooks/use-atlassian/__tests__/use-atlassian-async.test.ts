/**
 * Test for async cloudId resolution - simulates real App.tsx usage
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { createSignal, createRoot } from "solid-js";
import { useAtlassian } from "../use-atlassian.ts";

const DEFAULT_CONFIG = {
  jira: { cloud_id: "" }, // Empty string by default!
};

// Mock MCP SDK
const mockConnect = mock(() => Promise.resolve());
const mockClose = mock(() => Promise.resolve());
const mockCallTool = mock(() =>
  Promise.resolve({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          key: "AM-123",
          fields: {
            summary: "Test issue",
            description: "Test description",
            status: { name: "Open" },
            priority: { name: "High" },
            assignee: null,
            reporter: null,
            issuetype: { name: "Task" },
            project: { key: "AM" },
            created: "2024-01-01T00:00:00Z",
            updated: "2024-01-02T00:00:00Z",
          },
          self: "https://test.atlassian.net/rest/api/3/issue/AM-123",
        }),
      },
    ],
  }),
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

describe("useAtlassian async cloudId", () => {
  beforeEach(() => {
    mockConnect.mockClear();
    mockClose.mockClear();
    mockCallTool.mockClear();
  });

  it("should work when cloudId is passed as a getter that returns undefined initially", async () => {
    await createRoot(async (dispose) => {
      // Simulate config loading - starts as undefined
      const [config, setConfig] = createSignal<{ jira: { cloud_id: string } } | null>(null);

      // This is exactly how App.tsx creates the cloudId getter
      const cloudId = () => config()?.jira.cloud_id;

      // Log initial state
      console.log("Initial cloudId():", cloudId());

      // Create atlassian hook with getter - this is the pattern from App.tsx
      const atlassian = useAtlassian({ cloudId, autoConnect: false });

      // At this point, cloudId() returns undefined
      expect(cloudId()).toBe(undefined);

      // Simulate config loading after a delay (like autoLoad does)
      setConfig({ jira: { cloud_id: "test.atlassian.net" } });

      // Now cloudId() should return the value
      console.log("After config load cloudId():", cloudId());
      expect(cloudId()).toBe("test.atlassian.net");

      // Now try to fetch - this should work because getClient() resolves cloudId lazily
      const issue = await atlassian.fetchIssue("AM-123");

      expect(issue.key).toBe("AM-123");
      expect(issue.summary).toBe("Test issue");

      dispose();
    });
  });

  it("should fail with helpful error when cloudId getter always returns undefined", async () => {
    await createRoot(async (dispose) => {
      // Getter that always returns undefined (no config)
      const cloudId = () => undefined;

      const atlassian = useAtlassian({ cloudId, autoConnect: false });

      // Try to fetch - should fail with helpful error
      await expect(atlassian.fetchIssue("AM-123")).rejects.toThrow(
        "Jira cloud ID is not configured",
      );

      dispose();
    });
  });

  it("should work with static string cloudId", async () => {
    await createRoot(async (dispose) => {
      const atlassian = useAtlassian({
        cloudId: "static.atlassian.net",
        autoConnect: false,
      });

      const issue = await atlassian.fetchIssue("AM-123");
      expect(issue.key).toBe("AM-123");

      dispose();
    });
  });

  it("REPRODUCER: simulates exact App.tsx pattern with useConfig", async () => {
    // This test mimics the exact pattern in App.tsx
    await createRoot(async (dispose) => {
      // Simulate useConfig's internal state
      const [configState, setConfigState] = createSignal<{
        jira: { cloud_id: string };
        defaults: { agent: string };
        ui: { theme: string };
      } | null>(null);

      // This is how useConfig creates its cloudId accessor (with fallback to empty string)
      const cloudIdFromConfig = () => configState()?.jira.cloud_id ?? DEFAULT_CONFIG.jira.cloud_id;

      // Log what cloudId returns before config loads
      console.log("BEFORE config load - cloudId:", JSON.stringify(cloudIdFromConfig()));

      // This matches App.tsx line 65
      const cloudId = () => configState()?.jira.cloud_id;

      console.log("BEFORE config load - App.tsx pattern cloudId:", JSON.stringify(cloudId()));

      // Create atlassian like App.tsx does
      const atlassian = useAtlassian({ cloudId, autoConnect: false });

      // Simulate config loading (this happens async in real app)
      setConfigState({
        jira: { cloud_id: "adeptmind.atlassian.net" },
        defaults: { agent: "opencode" },
        ui: { theme: "tokyonight" },
      });

      console.log("AFTER config load - cloudId:", JSON.stringify(cloudId()));

      // This should work now
      const issue = await atlassian.fetchIssue("AM-123");
      expect(issue.key).toBe("AM-123");

      dispose();
    });
  });

  it("FAIL CASE: what happens when config never loads", async () => {
    await createRoot(async (dispose) => {
      // Config stays null (never loaded)
      const [configState] = createSignal<{
        jira: { cloud_id: string };
      } | null>(null);

      const cloudId = () => configState()?.jira.cloud_id;

      console.log("Config never loaded - cloudId:", JSON.stringify(cloudId()));

      const atlassian = useAtlassian({ cloudId, autoConnect: false });

      // Should fail with helpful error
      await expect(atlassian.fetchIssue("AM-123")).rejects.toThrow(
        "Jira cloud ID is not configured",
      );

      dispose();
    });
  });

  it("EDGE CASE: cloudId is empty string after config loads", async () => {
    await createRoot(async (dispose) => {
      // Config loads but cloud_id is empty string
      const [configState, setConfigState] = createSignal<{
        jira: { cloud_id: string };
      } | null>(null);

      const cloudId = () => configState()?.jira.cloud_id;

      // Config loads with empty cloud_id
      setConfigState({ jira: { cloud_id: "" } });

      console.log("Config loaded with empty cloud_id:", JSON.stringify(cloudId()));

      const atlassian = useAtlassian({ cloudId, autoConnect: false });

      // Should fail with helpful error (empty string is not valid)
      await expect(atlassian.fetchIssue("AM-123")).rejects.toThrow(
        "Jira cloud ID is not configured",
      );

      dispose();
    });
  });
});
