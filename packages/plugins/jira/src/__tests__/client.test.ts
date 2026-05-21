/**
 * Tests for AtlassianClient.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AtlassianClient } from "../client.ts";

// Save original fetch
const originalFetch = globalThis.fetch;

// Mock fetch function
const mockFetch =
  vi.fn<(...args: Parameters<typeof fetch>) => Promise<Response>>();

// Create a credential getter that returns test credentials
const createTestCredentialGetter = () => async () => ({
  email: "test@example.com",
  apiToken: "api-token-123",
  siteUrl: "test.atlassian.net",
});

describe("AtlassianClient", () => {
  beforeEach(() => {
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches an issue successfully", async () => {
    const client = new AtlassianClient(createTestCredentialGetter());

    const mockIssue = {
      key: "AM-123",
      self: "https://test.atlassian.net/rest/api/3/issue/AM-123",
      fields: { summary: "Test issue" },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockIssue,
    } as Response);

    const result = await client.fetchIssue("AM-123");
    expect(result).toEqual(mockIssue);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://test.atlassian.net/rest/api/3/issue/AM-123?fields=*all,-attachment",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          // Basic auth: base64(email:apiToken)
          Authorization: `Basic ${Buffer.from("test@example.com:api-token-123").toString("base64")}`,
        }),
      }),
    );
  });

  it("throws on API error", async () => {
    const client = new AtlassianClient(createTestCredentialGetter());

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Response);

    await expect(client.fetchIssue("AM-999")).rejects.toThrow(
      "Jira API error: 404 Not Found",
    );
  });

  it("adds a comment successfully", async () => {
    const client = new AtlassianClient(createTestCredentialGetter());

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "10001" }),
    } as Response);

    await client.addComment("AM-123", "LGTM");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://test.atlassian.net/rest/api/3/issue/AM-123/comment",
      expect.objectContaining({
        method: "POST",
        // Comment body should be in ADF format
        body: JSON.stringify({
          body: {
            version: 1,
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "LGTM" }] },
            ],
          },
        }),
      }),
    );
  });

  it("gets transitions for an issue", async () => {
    const client = new AtlassianClient(createTestCredentialGetter());

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        transitions: [
          {
            id: "31",
            name: "In Progress",
            to: { name: "In Progress", id: "3" },
          },
          { id: "41", name: "Done", to: { name: "Done", id: "6" } },
        ],
      }),
    } as Response);

    const transitions = await client.getTransitions("AM-123");
    expect(transitions).toHaveLength(2);
    expect(transitions[0]!.name).toBe("In Progress");
  });

  it("transitions an issue", async () => {
    const client = new AtlassianClient(createTestCredentialGetter());

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);

    await client.transitionIssue("AM-123", "31");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://test.atlassian.net/rest/api/3/issue/AM-123/transitions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ transition: { id: "31" } }),
      }),
    );
  });
});
