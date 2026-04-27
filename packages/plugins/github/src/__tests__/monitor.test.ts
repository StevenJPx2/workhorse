/**
 * Tests for GitHub PR monitor.
 */

import { describe, expect, it, vi } from "vitest";
import type { Database, MonitorContext } from "@jiratown/core";
import type { GitHubClient } from "../client.ts";
import { createGitHubPRMonitor } from "../monitor.ts";

describe("createGitHubPRMonitor", () => {
  function createMockContext(issueId = "issue-1"): MonitorContext {
    return {
      issueId,
      hooks: { emit: vi.fn() } as unknown as MonitorContext["hooks"],
      memory: {
        notifications: { create: vi.fn() },
      } as unknown as MonitorContext["memory"],
      config: {} as unknown as MonitorContext["config"],
    };
  }

  function createMockDb(issue: Record<string, unknown> | null = null): Database {
    return {
      issues: {
        getById: vi.fn().mockReturnValue(issue),
        update: vi.fn(),
      },
    } as unknown as Database;
  }

  function createMockClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
    return {
      fetchPR: vi.fn().mockResolvedValue({
        number: 42,
        title: "Test PR",
        state: "open",
        mergeable: true,
        mergeable_state: "clean",
        merged: false,
        draft: false,
        additions: 10,
        deletions: 5,
        changed_files: 3,
      }),
      getPRReviews: vi.fn().mockResolvedValue([]),
      getPRComments: vi.fn().mockResolvedValue([]),
      getCheckRuns: vi.fn().mockResolvedValue([]),
      ...overrides,
    } as unknown as GitHubClient;
  }

  it("returns hasChanges: false for non-GitHub issues", async () => {
    const db = createMockDb({ id: "issue-1", source: "jira" });
    const client = createMockClient();
    const monitor = createGitHubPRMonitor(client, 30000, db);
    const ctx = createMockContext();

    const result = await monitor.poll(ctx);
    expect(result.hasChanges).toBe(false);
  });

  it("returns hasChanges: false when no PR number", async () => {
    const db = createMockDb({
      id: "issue-1",
      source: "github",
      metadata: { owner: "octocat", repo: "hello-world" },
      prNumber: null,
    });
    const client = createMockClient();
    const monitor = createGitHubPRMonitor(client, 30000, db);
    const ctx = createMockContext();

    const result = await monitor.poll(ctx);
    expect(result.hasChanges).toBe(false);
  });

  it("detects new reviews and creates notifications", async () => {
    const db = createMockDb({
      id: "issue-1",
      source: "github",
      metadata: { owner: "octocat", repo: "hello-world" },
      prNumber: 42,
    });
    const client = createMockClient({
      getPRReviews: vi.fn().mockResolvedValue([
        {
          id: 1,
          user: { login: "reviewer" },
          state: "CHANGES_REQUESTED",
          body: "Please fix this",
          submitted_at: "2024-01-01T00:00:00Z",
        },
      ]),
    });
    const monitor = createGitHubPRMonitor(client, 30000, db);
    const ctx = createMockContext();

    const result = await monitor.poll(ctx);

    expect(result.hasChanges).toBe(true);
    expect(ctx.memory.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId: "issue-1",
        source: "github",
        priority: "high", // CHANGES_REQUESTED = high
        title: expect.stringContaining("changes requested"),
      }),
    );
  });

  it("detects new comments and creates notifications", async () => {
    const db = createMockDb({
      id: "issue-1",
      source: "github",
      metadata: { owner: "octocat", repo: "hello-world" },
      prNumber: 42,
    });
    const client = createMockClient({
      getPRComments: vi.fn().mockResolvedValue([
        {
          id: 100,
          user: { login: "commenter" },
          body: "Nice work!",
          created_at: "2024-01-01T00:00:00Z",
        },
      ]),
    });
    const monitor = createGitHubPRMonitor(client, 30000, db);
    const ctx = createMockContext();

    const result = await monitor.poll(ctx);

    expect(result.hasChanges).toBe(true);
    expect(ctx.memory.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId: "issue-1",
        source: "github",
        priority: "normal",
        title: expect.stringContaining("Comment from commenter"),
      }),
    );
  });

  it("detects review comments with file/line info", async () => {
    const db = createMockDb({
      id: "issue-1",
      source: "github",
      metadata: { owner: "octocat", repo: "hello-world" },
      prNumber: 42,
    });
    const client = createMockClient({
      getPRComments: vi.fn().mockResolvedValue([
        {
          id: 200,
          user: { login: "reviewer" },
          body: "This should be refactored",
          created_at: "2024-01-01T00:00:00Z",
          path: "src/index.ts",
          line: 42,
          diff_hunk: "@@ -40,6 +40,8 @@",
        },
      ]),
    });
    const monitor = createGitHubPRMonitor(client, 30000, db);
    const ctx = createMockContext();

    const result = await monitor.poll(ctx);

    expect(result.hasChanges).toBe(true);
    expect(ctx.memory.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("src/index.ts"),
        metadata: expect.objectContaining({
          path: "src/index.ts",
          line: 42,
        }),
      }),
    );
  });

  it("detects CI check failures", async () => {
    const db = createMockDb({
      id: "issue-1",
      source: "github",
      metadata: {
        owner: "octocat",
        repo: "hello-world",
        github_pr_monitor_state: {
          lastSeenReviewIds: [],
          lastSeenCommentIds: [],
          lastCheckConclusions: { CI: "success" }, // Was passing
          lastMergeableState: "clean",
        },
      },
      prNumber: 42,
      prUrl: "https://github.com/octocat/hello-world/pull/42",
    });
    const client = createMockClient({
      getCheckRuns: vi.fn().mockResolvedValue([
        {
          id: 1,
          name: "CI",
          status: "completed",
          conclusion: "failure", // Now failing
          html_url: "https://github.com/...",
        },
      ]),
    });
    const monitor = createGitHubPRMonitor(client, 30000, db);
    const ctx = createMockContext();

    const result = await monitor.poll(ctx);

    expect(result.hasChanges).toBe(true);
    expect(ctx.memory.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: "high",
        title: expect.stringContaining("CI check failed"),
      }),
    );
  });

  it("detects merge conflicts", async () => {
    const db = createMockDb({
      id: "issue-1",
      source: "github",
      metadata: {
        owner: "octocat",
        repo: "hello-world",
        github_pr_monitor_state: {
          lastSeenReviewIds: [],
          lastSeenCommentIds: [],
          lastCheckConclusions: {},
          lastMergeableState: "clean", // Was clean
        },
      },
      prNumber: 42,
    });
    const client = createMockClient({
      fetchPR: vi.fn().mockResolvedValue({
        number: 42,
        mergeable_state: "dirty", // Now has conflicts
        state: "open",
      }),
    });
    const monitor = createGitHubPRMonitor(client, 30000, db);
    const ctx = createMockContext();

    const result = await monitor.poll(ctx);

    expect(result.hasChanges).toBe(true);
    expect(ctx.memory.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: "high",
        title: expect.stringContaining("Merge conflicts"),
      }),
    );
  });

  it("updates metadata with seen IDs to avoid duplicate notifications", async () => {
    const db = createMockDb({
      id: "issue-1",
      source: "github",
      metadata: { owner: "octocat", repo: "hello-world" },
      prNumber: 42,
    });
    const client = createMockClient({
      getPRReviews: vi
        .fn()
        .mockResolvedValue([{ id: 1, user: { login: "r" }, state: "APPROVED", body: "" }]),
    });
    const monitor = createGitHubPRMonitor(client, 30000, db);
    const ctx = createMockContext();

    await monitor.poll(ctx);

    expect(db.issues.update).toHaveBeenCalledWith(
      "issue-1",
      expect.objectContaining({
        metadata: expect.objectContaining({
          github_pr_monitor_state: expect.objectContaining({
            lastSeenReviewIds: [1],
          }),
        }),
      }),
    );
  });
});
