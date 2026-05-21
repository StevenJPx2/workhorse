import {
  type MockInstance,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { OrchestratorTool } from "workhorse-core";

import type { GitHubClient } from "../client.ts";
import { createGitHubTools } from "../tools";

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
        getByExternalId: vi.fn().mockReturnValue({
          id: "issue-1",
          source: "github",
          status: "implementing",
          metadata: { owner: "octocat", repo: "hello-world", number: 42 },
        }),
        update: vi.fn(),
      },
    };

    const mockHooks = {
      emit: vi.fn(),
      callHook: vi.fn().mockResolvedValue(undefined),
    };
    const mockMonitors = { startMonitor: vi.fn() };

    const tools = createGitHubTools(
      mockClient,
      mockDb as any,
      mockHooks as any,
      mockMonitors as any,
    );
    const tool = tools.find(
      (t: OrchestratorTool) => t.name === "github_open_pr",
    )!;

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
    expect(mockHooks.emit).toHaveBeenCalledWith(
      "issue.status_changed",
      expect.any(Object),
    );
    expect(mockMonitors.startMonitor).toHaveBeenCalledWith(
      "github-pr",
      "issue-1",
    );
  });

  it("derives owner/repo from git remote for non-GitHub issues", async () => {
    mockSpawn
      .mockReturnValueOnce({
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                "git@github.com:octocat/hello-world.git\n",
              ),
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
        getByExternalId: vi.fn().mockReturnValue({
          id: "issue-1",
          source: "jira",
          status: "implementing",
          metadata: { cloudId: "company", priority: "High" },
        }),
        update: vi.fn(),
      },
    };

    const mockHooks = {
      emit: vi.fn(),
      callHook: vi.fn().mockResolvedValue(undefined),
    };
    const mockMonitors = { startMonitor: vi.fn() };

    const tools = createGitHubTools(
      mockClient,
      mockDb as any,
      mockHooks as any,
      mockMonitors as any,
    );
    const tool = tools.find(
      (t: OrchestratorTool) => t.name === "github_open_pr",
    )!;

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
    expect(mockClient.createPR).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "octocat",
        repo: "hello-world",
      }),
    );
  });

  it("returns error when issue not found", async () => {
    const mockDb = {
      issues: { getByExternalId: vi.fn().mockReturnValue(null) },
    };
    const tools = createGitHubTools(
      {} as GitHubClient,
      mockDb as any,
      {} as any,
      {} as any,
    );
    const tool = tools.find(
      (t: OrchestratorTool) => t.name === "github_open_pr",
    )!;
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
    mockSpawn.mockReturnValueOnce({
      stdout: new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode("https://gitlab.com/org/repo.git\n"),
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
    });

    const mockDb = {
      issues: {
        getByExternalId: vi.fn().mockReturnValue({
          id: "issue-1",
          source: "jira",
          metadata: { cloudId: "company" },
        }),
      },
    };

    const tools = createGitHubTools(
      {} as GitHubClient,
      mockDb as any,
      {} as any,
      {} as any,
    );
    const tool = tools.find(
      (t: OrchestratorTool) => t.name === "github_open_pr",
    )!;

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
