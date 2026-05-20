/**
 * Tests for FigmaClient — mocks globalThis.fetch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FigmaClient } from "../client.ts";

const originalFetch = globalThis.fetch;
const mockFetch = vi.fn<(...args: Parameters<typeof fetch>) => Promise<Response>>();

const testClient = () => new FigmaClient(async () => ({ accessToken: "test-token-abc" }));

describe("FigmaClient", () => {
  beforeEach(() => {
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // fetchFile

  describe("fetchFile", () => {
    it("GETs the correct Figma API URL with depth param", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: "My App", version: "v1" }),
      } as Response);

      const client = testClient();
      await client.fetchFile("abc123", 3);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.figma.com/v1/files/abc123?depth=3",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "X-Figma-Token": "test-token-abc",
          }),
        }),
      );
    });

    it("defaults to depth=2", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: "App", version: "v1" }),
      } as Response);

      await testClient().fetchFile("key1");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.figma.com/v1/files/key1?depth=2",
        expect.anything(),
      );
    });

    it("returns the parsed JSON response", async () => {
      const fixture = { name: "Design System", version: "v99", lastModified: "2024-01-01" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => fixture,
      } as Response);

      const result = await testClient().fetchFile("key1");
      expect(result).toEqual(fixture);
    });

    it("throws a descriptive error on non-2xx response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: async () => "Invalid token",
      } as Response);

      await expect(testClient().fetchFile("badkey")).rejects.toThrow(
        /Figma API error 403 Forbidden/,
      );
    });
  });

  // fetchNode

  describe("fetchNode", () => {
    it("URL-encodes the node ID and hits the /nodes endpoint", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ nodes: { "5:10": { document: { id: "5:10", name: "Frame" } } } }),
      } as Response);

      await testClient().fetchNode("fileKey1", "5:10");

      // colon must be encoded as %3A
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/files/fileKey1/nodes?ids=5%3A10"),
        expect.anything(),
      );
    });

    it("returns the nodes map", async () => {
      const fixture = { nodes: { "1:2": { document: { id: "1:2", name: "Hero" } } } };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => fixture,
      } as Response);

      const result = await testClient().fetchNode("fileKey1", "1:2");
      expect(result).toEqual(fixture);
    });
  });

  // fetchComments

  describe("fetchComments", () => {
    it("fetches and returns the comments array", async () => {
      const comments = [
        {
          id: "1",
          message: "Looks good",
          user: { id: "u1", handle: "alice", img_url: "" },
          created_at: "2024-01-01",
          resolved_at: null,
        },
        {
          id: "2",
          message: "One nit",
          user: { id: "u2", handle: "bob", img_url: "" },
          created_at: "2024-01-02",
          resolved_at: null,
        },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ comments }),
      } as Response);

      const result = await testClient().fetchComments("fileKey1");
      expect(result).toEqual(comments);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.figma.com/v1/files/fileKey1/comments",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("returns an empty array when there are no comments", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ comments: [] }),
      } as Response);

      const result = await testClient().fetchComments("fileKey1");
      expect(result).toEqual([]);
    });

    it("throws on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "",
      } as Response);

      await expect(testClient().fetchComments("no-such-file")).rejects.toThrow(/404/);
    });
  });

  // postComment

  describe("postComment", () => {
    it("POSTs a new top-level comment", async () => {
      const posted = {
        id: "10",
        message: "Hello!",
        user: { id: "u1", handle: "agent", img_url: "" },
        created_at: "2024-01-03",
        resolved_at: null,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => posted,
      } as Response);

      const result = await testClient().postComment("fileKey1", "Hello!");
      expect(result).toEqual(posted);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.figma.com/v1/files/fileKey1/comments",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ message: "Hello!" }),
        }),
      );
    });

    it("includes comment_id in body when replying", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "11",
          message: "Reply!",
          user: { id: "u1", handle: "agent", img_url: "" },
          created_at: "2024-01-04",
          resolved_at: null,
        }),
      } as Response);

      await testClient().postComment("fileKey1", "Reply!", "10");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: JSON.stringify({ message: "Reply!", comment_id: "10" }),
        }),
      );
    });

    it("throws on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => "Invalid comment",
      } as Response);

      await expect(testClient().postComment("fileKey1", "")).rejects.toThrow(/400/);
    });
  });

  // fetchFileVersion

  describe("fetchFileVersion", () => {
    it("returns the version string from the file", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: "App", version: "v77", lastModified: "2024-06-01" }),
      } as Response);

      const version = await testClient().fetchFileVersion("fileKey1");
      expect(version).toBe("v77");
      // Uses depth=1 for cheapness
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("depth=1"), expect.anything());
    });
  });
});
