/**
 * Tests for GitHub tools.
 */

import type { OrchestratorTool } from "@stevenjpx2/jiratown-core";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { GitHubClient } from "../client.ts";
import { createGitHubTools } from "../tools";

describe("createGitHubTools", () => {
  it("returns all three tools", () => {
    const mockClient = {} as GitHubClient;
    const tools = createGitHubTools(mockClient, {} as any, {} as any, {} as any);
    expect(tools).toHaveLength(3);
    expect(tools[0]!.name).toBe("github_open_pr");
    expect(tools[1]!.name).toBe("github_add_comment");
    expect(tools[2]!.name).toBe("github_get_pr_status");
  });
});

describe("github_add_comment tool", () => {
  it("adds a comment successfully", async () => {
    const mockClient = {
      addComment: vi.fn().mockResolvedValue(undefined),
    } as unknown as GitHubClient;

    const tools = createGitHubTools(mockClient, {} as any, {} as any, {} as any);
    const tool = tools.find((t: OrchestratorTool) => t.name === "github_add_comment")!;

    const result = await tool.execute(
      { owner: "octocat", repo: "hello-world", number: 42, body: "LGTM!" },
      {
        issueId: "issue-1",
        worktreePath: "/tmp",
        db: {} as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(mockClient.addComment).toHaveBeenCalledWith("octocat", "hello-world", 42, "LGTM!");
    expect(result.success).toBe(true);
    expect(result.output).toContain("Comment added");
  });

  it("returns error on failure", async () => {
    const mockClient = {
      addComment: vi.fn().mockRejectedValue(new Error("API error")),
    } as unknown as GitHubClient;

    const tools = createGitHubTools(mockClient, {} as any, {} as any, {} as any);
    const tool = tools.find((t: OrchestratorTool) => t.name === "github_add_comment")!;

    const result = await tool.execute(
      { owner: "octocat", repo: "hello-world", number: 42, body: "Test" },
      {
        issueId: "issue-1",
        worktreePath: "/tmp",
        db: {} as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("API error");
  });
});

describe("github_get_pr_status tool", () => {
  it("returns PR status summary", async () => {
    const mockClient = {
      fetchPR: vi.fn().mockResolvedValue({
        state: "open",
        draft: false,
        mergeable: true,
        mergeable_state: "clean",
        merged: false,
        additions: 50,
        deletions: 20,
        changed_files: 5,
      }),
      getPRReviews: vi
        .fn()
        .mockResolvedValue([
          { state: "APPROVED" },
          { state: "CHANGES_REQUESTED" },
          { state: "COMMENTED" },
        ]),
      getCheckRuns: vi.fn().mockResolvedValue([
        { conclusion: "success", status: "completed" },
        { conclusion: "success", status: "completed" },
      ]),
    } as unknown as GitHubClient;

    const tools = createGitHubTools(mockClient, {} as any, {} as any, {} as any);
    const tool = tools.find((t: OrchestratorTool) => t.name === "github_get_pr_status")!;

    const result = await tool.execute(
      { owner: "octocat", repo: "hello-world", number: 42 },
      {
        issueId: "issue-1",
        worktreePath: "/tmp",
        db: {} as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(result.success).toBe(true);
    const status = JSON.parse(result.output!);
    expect(status.state).toBe("open");
    expect(status.draft).toBe(false);
    expect(status.mergeable).toBe(true);
    expect(status.reviews.approved).toBe(1);
    expect(status.reviews.changesRequested).toBe(1);
    expect(status.reviews.commented).toBe(1);
    expect(status.checks.passing).toBe(2);
    expect(status.checks.total).toBe(2);
    expect(status.additions).toBe(50);
    expect(status.deletions).toBe(20);
  });

  it("returns merged state when PR is merged", async () => {
    const mockClient = {
      fetchPR: vi.fn().mockResolvedValue({
        state: "closed",
        merged: true,
        draft: false,
        mergeable: null,
        mergeable_state: "unknown",
        additions: 10,
        deletions: 5,
        changed_files: 2,
      }),
      getPRReviews: vi.fn().mockResolvedValue([]),
      getCheckRuns: vi.fn().mockResolvedValue([]),
    } as unknown as GitHubClient;

    const tools = createGitHubTools(mockClient, {} as any, {} as any, {} as any);
    const tool = tools.find((t: OrchestratorTool) => t.name === "github_get_pr_status")!;

    const result = await tool.execute(
      { owner: "octocat", repo: "hello-world", number: 42 },
      {
        issueId: "issue-1",
        worktreePath: "/tmp",
        db: {} as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    const status = JSON.parse(result.output!);
    expect(status.state).toBe("merged");
  });
});

const isBun = typeof globalThis.Bun !== "undefined";

describe.skipIf(!isBun)("github_open_pr tool", () => {
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

  it("creates a PR and updates issue", async () => {
    // First call: git branch, second call: git push
    mockSpawn
      .mockReturnValueOnce({
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("feature-branch\n"));
            controller.close();
          },
        }),
        stderr: new ReadableStream({
          start(c) {
            c.close();
          },
        }),
        exited: Promise.resolve(0),
      })
      .mockReturnValueOnce({
        stdout: new ReadableStream({
          start(c) {
            c.close();
          },
        }),
        stderr: new ReadableStream({
          start(c) {
            c.close();
          },
        }),
        exited: Promise.resolve(0),
      });

    const mockClient = {
      createPR: vi.fn().mockResolvedValue({
        url: "https://github.com/octocat/hello-world/pull/99",
        number: 99,
      }),
    } as unknown as GitHubClient;

    const mockDb = {
      issues: {
        getById: vi.fn().mockReturnValue({
          id: "issue-1",
          source: "github",
          status: "implementing",
          metadata: { owner: "octocat", repo: "hello-world", number: 42 },
        }),
        update: vi.fn(),
      },
    };

    const mockHooks = { emit: vi.fn() };
    const mockMonitors = { startMonitor: vi.fn() };

    const tools = createGitHubTools(
      mockClient,
      mockDb as any,
      mockHooks as any,
      mockMonitors as any,
    );
    const tool = tools.find((t: OrchestratorTool) => t.name === "github_open_pr")!;

    const result = await tool.execute(
      { title: "Add feature", body: "Description", base: "main" },
      {
        issueId: "issue-1",
        worktreePath: "/tmp/worktree",
        db: mockDb as any,
        hooks: mockHooks as any,
        memory: {} as any,
      },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("#99");
    expect(mockDb.issues.update).toHaveBeenCalledWith(
      "issue-1",
      expect.objectContaining({
        status: "in_review",
        metadata: expect.objectContaining({
          prNumber: 99,
          prUrl: "https://github.com/octocat/hello-world/pull/99",
        }),
      }),
    );
    expect(mockHooks.emit).toHaveBeenCalledWith("issue.status_changed", expect.any(Object));
    expect(mockMonitors.startMonitor).toHaveBeenCalledWith("github-pr", "issue-1");
  });

  it("derives owner/repo from git remote for non-GitHub issues", async () => {
    // Mock: git remote, git branch, git push
    mockSpawn
      .mockReturnValueOnce({
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode("git@github.com:octocat/hello-world.git\n"),
            );
            controller.close();
          },
        }),
        stderr: new ReadableStream({
          start(c) {
            c.close();
          },
        }),
        exited: Promise.resolve(0),
      })
      .mockReturnValueOnce({
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("task/AM-123\n"));
            controller.close();
          },
        }),
        stderr: new ReadableStream({
          start(c) {
            c.close();
          },
        }),
        exited: Promise.resolve(0),
      })
      .mockReturnValueOnce({
        stdout: new ReadableStream({
          start(c) {
            c.close();
          },
        }),
        stderr: new ReadableStream({
          start(c) {
            c.close();
          },
        }),
        exited: Promise.resolve(0),
      });

    const mockClient = {
      createPR: vi.fn().mockResolvedValue({
        url: "https://github.com/octocat/hello-world/pull/42",
        number: 42,
      }),
    } as unknown as GitHubClient;

    const mockDb = {
      issues: {
        getById: vi.fn().mockReturnValue({
          id: "issue-1",
          source: "jira", // Jira issue, not GitHub
          status: "implementing",
          metadata: { cloudId: "company", priority: "High" }, // No owner/repo
        }),
        update: vi.fn(),
      },
    };

    const mockHooks = { emit: vi.fn() };
    const mockMonitors = { startMonitor: vi.fn() };

    const tools = createGitHubTools(
      mockClient,
      mockDb as any,
      mockHooks as any,
      mockMonitors as any,
    );
    const tool = tools.find((t: OrchestratorTool) => t.name === "github_open_pr")!;

    const result = await tool.execute(
      { title: "AM-123: Implement feature", base: "main" },
      {
        issueId: "issue-1",
        worktreePath: "/tmp/worktree",
        db: mockDb as any,
        hooks: mockHooks as any,
        memory: {} as any,
      },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("#42");
    // Verify createPR was called with owner/repo derived from git remote
    expect(mockClient.createPR).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "octocat",
        repo: "hello-world",
      }),
    );
  });

  it("returns error when issue not found", async () => {
    const mockDb = {
      issues: {
        getById: vi.fn().mockReturnValue(null),
      },
    };

    const tools = createGitHubTools({} as GitHubClient, mockDb as any, {} as any, {} as any);
    const tool = tools.find((t: OrchestratorTool) => t.name === "github_open_pr")!;

    const result = await tool.execute(
      { title: "Test", base: "main" },
      {
        issueId: "issue-1",
        worktreePath: "/tmp",
        db: mockDb as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns error when owner/repo cannot be determined from metadata or git remote", async () => {
    // Mock git remote to return a non-GitHub URL
    mockSpawn.mockReturnValueOnce({
      stdout: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("https://gitlab.com/org/repo.git\n"));
          controller.close();
        },
      }),
      stderr: new ReadableStream({
        start(c) {
          c.close();
        },
      }),
      exited: Promise.resolve(0),
    });

    const mockDb = {
      issues: {
        getById: vi.fn().mockReturnValue({
          id: "issue-1",
          source: "jira", // Non-GitHub source
          metadata: { cloudId: "company" }, // Jira metadata, no owner/repo
        }),
      },
    };

    const tools = createGitHubTools({} as GitHubClient, mockDb as any, {} as any, {} as any);
    const tool = tools.find((t: OrchestratorTool) => t.name === "github_open_pr")!;

    const result = await tool.execute(
      { title: "Test", base: "main" },
      {
        issueId: "issue-1",
        worktreePath: "/tmp",
        db: mockDb as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("owner/repo");
  });
});
