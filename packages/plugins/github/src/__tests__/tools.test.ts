import { describe, expect, it, vi } from "vitest";
import type { AttachmentService, OrchestratorTool } from "workhorse-core";

import type { GitHubClient } from "../client.ts";
import { createGitHubTools } from "../tools";

describe("createGitHubTools", () => {
  it("returns five tools without attachmentService", () => {
    const mockClient = {} as GitHubClient;
    const tools = createGitHubTools(
      mockClient,
      {} as any,
      {} as any,
      {} as any,
    );
    expect(tools).toHaveLength(5);
    expect(tools[0]!.name).toBe("github_open_pr");
    expect(tools[1]!.name).toBe("github_add_comment");
    expect(tools[2]!.name).toBe("github_get_pr_status");
    expect(tools[3]!.name).toBe("github_get_ci_check");
    expect(tools[4]!.name).toBe("github_get_pr_reviews");
  });

  it("returns six tools with attachmentService", () => {
    const mockClient = {} as GitHubClient;
    const mockAttachmentService = {} as AttachmentService;
    const tools = createGitHubTools(
      mockClient,
      {} as any,
      {} as any,
      {} as any,
      mockAttachmentService,
    );
    expect(tools).toHaveLength(6);
    expect(tools[5]!.name).toBe("github_get_attachments");
  });
});

describe("github_add_comment tool", () => {
  it("adds a comment successfully", async () => {
    const mockClient = {
      addComment: vi.fn().mockResolvedValue(undefined),
    } as unknown as GitHubClient;

    const tools = createGitHubTools(
      mockClient,
      {} as any,
      {} as any,
      {} as any,
    );
    const tool = tools.find(
      (t: OrchestratorTool) => t.name === "github_add_comment",
    )!;

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

    expect(mockClient.addComment).toHaveBeenCalledWith(
      "octocat",
      "hello-world",
      42,
      expect.stringContaining("LGTM!"),
    );
    expect(mockClient.addComment).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.stringContaining("Posted by Workhorse"),
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain("Comment added");
  });

  it("returns error on failure", async () => {
    const mockClient = {
      addComment: vi.fn().mockRejectedValue(new Error("API error")),
    } as unknown as GitHubClient;
    const tools = createGitHubTools(
      mockClient,
      {} as any,
      {} as any,
      {} as any,
    );
    const tool = tools.find(
      (t: OrchestratorTool) => t.name === "github_add_comment",
    )!;
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

    const tools = createGitHubTools(
      mockClient,
      {} as any,
      {} as any,
      {} as any,
    );
    const tool = tools.find(
      (t: OrchestratorTool) => t.name === "github_get_pr_status",
    )!;

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

    const tools = createGitHubTools(
      mockClient,
      {} as any,
      {} as any,
      {} as any,
    );
    const tool = tools.find(
      (t: OrchestratorTool) => t.name === "github_get_pr_status",
    )!;

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
