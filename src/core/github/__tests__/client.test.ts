/**
 * Tests for GitHub MCP Client
 *
 * Uses dependency injection to mock the MCP SDK Client.
 * The actual connection logic requires a real MCP server so cannot
 * be unit tested - only the method call patterns are tested here.
 */

import { describe, it, expect } from "bun:test";
import { GitHubClient } from "../client.ts";
// McpToolResultContent used by future tests

describe("GitHubClient", () => {
  describe("isConnected", () => {
    it("starts disconnected", () => {
      const client = new GitHubClient();
      expect(client.isConnected).toBe(false);
    });
  });

  describe("disconnect", () => {
    it("is a no-op when not connected", async () => {
      const client = new GitHubClient();
      await client.disconnect();
      expect(client.isConnected).toBe(false);
    });
  });

  describe("method guards", () => {
    it("getPullRequest throws when not connected", async () => {
      const client = new GitHubClient();
      expect(client.getPullRequest("owner", "repo", 1)).rejects.toThrow(
        "Not connected to GitHub MCP",
      );
    });

    it("listPullRequests throws when not connected", async () => {
      const client = new GitHubClient();
      expect(client.listPullRequests("owner", "repo")).rejects.toThrow(
        "Not connected to GitHub MCP",
      );
    });

    it("listReviewComments throws when not connected", async () => {
      const client = new GitHubClient();
      expect(client.listReviewComments("owner", "repo", 1)).rejects.toThrow(
        "Not connected to GitHub MCP",
      );
    });

    it("listReviews throws when not connected", async () => {
      const client = new GitHubClient();
      expect(client.listReviews("owner", "repo", 1)).rejects.toThrow("Not connected to GitHub MCP");
    });

    it("createReview throws when not connected", async () => {
      const client = new GitHubClient();
      expect(
        client.createReview("owner", "repo", 1, {
          body: "test",
          event: "COMMENT",
        }),
      ).rejects.toThrow("Not connected to GitHub MCP");
    });

    it("createReviewComment throws when not connected", async () => {
      const client = new GitHubClient();
      expect(client.createReviewComment("owner", "repo", 1, "test")).rejects.toThrow(
        "Not connected to GitHub MCP",
      );
    });
  });
});
