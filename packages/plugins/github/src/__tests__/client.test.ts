/**
 * Tests for GitHubClient (gh CLI wrapper).
 *
 * NOTE: These tests require Bun runtime. They are skipped when running in Node.js (vitest default).
 * Run with `bun test` to execute these tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { GitHubClient } from "../client.ts";

const isBun = typeof globalThis.Bun !== "undefined";

describe.skipIf(!isBun)("GitHubClient", () => {
  let originalSpawn: typeof Bun.spawn;
  let mockSpawn: MockInstance;

  beforeEach(() => {
    originalSpawn = Bun.spawn;
    mockSpawn = vi.fn();
    // @ts-expect-error - mocking Bun.spawn
    Bun.spawn = mockSpawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  function mockGhCommand(stdout: string, exitCode = 0) {
    mockSpawn.mockReturnValue({
      stdout: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(stdout));
          controller.close();
        },
      }),
      stderr: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
      exited: Promise.resolve(exitCode),
    });
  }

  describe("connect", () => {
    it("verifies gh auth status", async () => {
      mockGhCommand("github.com\n  ✓ Logged in to github.com\n");
      const client = new GitHubClient();
      await expect(client.connect()).resolves.toBeUndefined();
      expect(mockSpawn).toHaveBeenCalledWith(["gh", "auth", "status"], expect.any(Object));
    });

    it("throws when not authenticated", async () => {
      mockGhCommand("", 1);
      const client = new GitHubClient();
      await expect(client.connect()).rejects.toThrow(/not authenticated/i);
    });
  });

  describe("fetchIssue", () => {
    it("fetches an issue via gh api", async () => {
      const issueData = {
        number: 42,
        title: "Test issue",
        body: "Description",
        state: "open",
        html_url: "https://github.com/octocat/hello-world/issues/42",
        assignee: { login: "alice" },
        labels: [{ name: "bug" }],
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
      };
      mockGhCommand(JSON.stringify(issueData));

      const client = new GitHubClient();
      const issue = await client.fetchIssue("octocat", "hello-world", 42);

      expect(mockSpawn).toHaveBeenCalledWith(
        ["gh", "api", "/repos/octocat/hello-world/issues/42"],
        expect.any(Object),
      );
      expect(issue.owner).toBe("octocat");
      expect(issue.repo).toBe("hello-world");
      expect(issue.number).toBe(42);
      expect(issue.title).toBe("Test issue");
    });
  });

  describe("fetchPR", () => {
    it("fetches a PR via gh api", async () => {
      const prData = {
        number: 123,
        title: "Fix bug",
        body: "Description",
        state: "open",
        html_url: "https://github.com/octocat/hello-world/pull/123",
        head: { ref: "fix-bug", sha: "abc123" },
        base: { ref: "main" },
        mergeable: true,
        mergeable_state: "clean",
        merged: false,
        draft: false,
        additions: 10,
        deletions: 5,
        changed_files: 3,
      };
      mockGhCommand(JSON.stringify(prData));

      const client = new GitHubClient();
      const pr = await client.fetchPR("octocat", "hello-world", 123);

      expect(mockSpawn).toHaveBeenCalledWith(
        ["gh", "api", "/repos/octocat/hello-world/pulls/123"],
        expect.any(Object),
      );
      expect(pr.owner).toBe("octocat");
      expect(pr.repo).toBe("hello-world");
      expect(pr.number).toBe(123);
      expect(pr.mergeable).toBe(true);
    });
  });

  describe("createPR", () => {
    it("creates a PR using gh pr create", async () => {
      mockGhCommand("https://github.com/octocat/hello-world/pull/456\n");

      const client = new GitHubClient();
      const result = await client.createPR({
        owner: "octocat",
        repo: "hello-world",
        head: "feature-branch",
        base: "main",
        title: "Add feature",
        body: "Description",
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        [
          "gh",
          "pr",
          "create",
          "--repo",
          "octocat/hello-world",
          "--head",
          "feature-branch",
          "--base",
          "main",
          "--title",
          "Add feature",
          "--body",
          "Description",
        ],
        expect.any(Object),
      );
      expect(result.url).toBe("https://github.com/octocat/hello-world/pull/456");
      expect(result.number).toBe(456);
    });

    it("creates a draft PR when draft option is true", async () => {
      mockGhCommand("https://github.com/octocat/hello-world/pull/789\n");

      const client = new GitHubClient();
      await client.createPR({
        owner: "octocat",
        repo: "hello-world",
        head: "wip-branch",
        base: "main",
        title: "WIP: Feature",
        draft: true,
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.arrayContaining(["--draft"]),
        expect.any(Object),
      );
    });
  });

  describe("getPRReviews", () => {
    it("fetches PR reviews via gh api", async () => {
      const reviews = [
        {
          id: 1,
          user: { login: "reviewer" },
          state: "APPROVED",
          body: "LGTM",
          submitted_at: "2024-01-01T00:00:00Z",
        },
      ];
      mockGhCommand(JSON.stringify(reviews));

      const client = new GitHubClient();
      const result = await client.getPRReviews("octocat", "hello-world", 42);

      expect(mockSpawn).toHaveBeenCalledWith(
        ["gh", "api", "/repos/octocat/hello-world/pulls/42/reviews"],
        expect.any(Object),
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.state).toBe("APPROVED");
    });
  });

  describe("getCheckRuns", () => {
    it("fetches check runs via gh api", async () => {
      const response = {
        check_runs: [
          {
            id: 1,
            name: "CI",
            status: "completed",
            conclusion: "success",
            html_url: "https://github.com/...",
          },
        ],
      };
      mockGhCommand(JSON.stringify(response));

      const client = new GitHubClient();
      const result = await client.getCheckRuns("octocat", "hello-world", "abc123");

      expect(mockSpawn).toHaveBeenCalledWith(
        ["gh", "api", "/repos/octocat/hello-world/commits/abc123/check-runs"],
        expect.any(Object),
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.conclusion).toBe("success");
    });
  });

  describe("addComment", () => {
    it("posts a comment via gh api", async () => {
      mockGhCommand(JSON.stringify({ id: 123 }));

      const client = new GitHubClient();
      await client.addComment("octocat", "hello-world", 42, "Great work!");

      expect(mockSpawn).toHaveBeenCalledWith(
        [
          "gh",
          "api",
          "/repos/octocat/hello-world/issues/42/comments",
          "--method",
          "POST",
          "--input",
          "-",
        ],
        expect.any(Object),
      );
    });
  });
});
