/**
 * Tests for Jira cross-plugin sync.
 */

import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import type { Database, WorkhorseContext } from "workhorse-core";

import type { AtlassianClient } from "../client.ts";
import { registerCrossPluginSync } from "../cross-plugin-sync.ts";

type HookHandler = (event: unknown) => void | Promise<void>;

/** Simple mock emitter for testing that tracks async handlers */
function createMockEmitter() {
  const handlers = new Map<string, HookHandler[]>();
  let lastEmitPromises: Promise<void>[] = [];

  return {
    on: (event: string, handler: HookHandler) => {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
    },
    emit: (event: string, payload: unknown) => {
      const eventHandlers = handlers.get(event) || [];
      lastEmitPromises = eventHandlers.map((handler) => {
        const result = handler(payload);
        return result instanceof Promise ? result : Promise.resolve();
      });
    },
    /** Wait for all handlers from the last emit to complete */
    async flush() {
      await Promise.all(lastEmitPromises);
    },
    off: vi.fn(),
    all: { clear: vi.fn() },
  };
}

describe("registerCrossPluginSync", () => {
  let hooks: ReturnType<typeof createMockEmitter>;
  let mockCtx: WorkhorseContext;
  let mockClient: AtlassianClient;
  let mockDb: Database;

  beforeEach(() => {
    hooks = createMockEmitter();

    mockClient = {
      fetchIssue: vi.fn().mockResolvedValue({
        key: "PROJ-123",
        fields: {
          status: { name: "In Progress", id: "3" },
          reporter: { displayName: "John Doe", accountId: "abc123" },
          assignee: { displayName: "Jane Dev", accountId: "xyz789" },
        },
      }),
      getTransitions: vi.fn().mockResolvedValue([
        { id: "11", name: "Start Progress", to: { name: "In Progress", id: "3" } },
        { id: "21", name: "Move to QA", to: { name: "In QA", id: "4" } },
        { id: "31", name: "Done", to: { name: "Done", id: "5" } },
      ]),
      transitionIssue: vi.fn().mockResolvedValue(undefined),
      editIssue: vi.fn().mockResolvedValue(undefined),
      addComment: vi.fn().mockResolvedValue(undefined),
    } as unknown as AtlassianClient;

    mockDb = {
      issues: {
        getById: vi.fn().mockReturnValue({
          id: "issue-1",
          externalId: "PROJ-123",
          source: "jira",
        }),
      },
    } as unknown as Database;

    mockCtx = {
      hooks,
      db: mockDb,
    } as unknown as WorkhorseContext;
  });

  it("registers listener for github:pr.merged event", () => {
    const onSpy = vi.spyOn(hooks, "on");

    registerCrossPluginSync(mockCtx, mockClient, mockDb);

    expect(onSpy).toHaveBeenCalledWith("github:pr.merged", expect.any(Function));
  });

  it("transitions Jira issue to QA when PR is merged", async () => {
    registerCrossPluginSync(mockCtx, mockClient, mockDb);

    // Emit the github:pr.merged event
    hooks.emit("github:pr.merged", {
      issueId: "issue-1",
      externalId: "PROJ-123",
      source: "jira",
      pr: {
        number: 42,
        url: "https://github.com/octocat/hello-world/pull/42",
        mergedBy: "octocat",
        mergedAt: "2024-01-15T10:30:00Z",
      },
    });

    // Wait for async handler to complete
    await hooks.flush();

    expect(mockClient.transitionIssue).toHaveBeenCalledWith("PROJ-123", "21");
  });

  it("assigns issue to reporter when PR is merged", async () => {
    registerCrossPluginSync(mockCtx, mockClient, mockDb);

    hooks.emit("github:pr.merged", {
      issueId: "issue-1",
      externalId: "PROJ-123",
      source: "jira",
      pr: {
        number: 42,
        url: "https://github.com/octocat/hello-world/pull/42",
        mergedBy: "octocat",
        mergedAt: "2024-01-15T10:30:00Z",
      },
    });

    await hooks.flush();

    expect(mockClient.editIssue).toHaveBeenCalledWith("PROJ-123", {
      assignee: { accountId: "abc123" },
    });
  });

  it("adds comment with PR merge details", async () => {
    registerCrossPluginSync(mockCtx, mockClient, mockDb);

    hooks.emit("github:pr.merged", {
      issueId: "issue-1",
      externalId: "PROJ-123",
      source: "jira",
      pr: {
        number: 42,
        url: "https://github.com/octocat/hello-world/pull/42",
        mergedBy: "octocat",
        mergedAt: "2024-01-15T10:30:00Z",
      },
    });

    await hooks.flush();

    expect(mockClient.addComment).toHaveBeenCalledWith(
      "PROJ-123",
      expect.stringContaining("PR #42 has been merged"),
    );
    expect(mockClient.addComment).toHaveBeenCalledWith(
      "PROJ-123",
      expect.stringContaining("Merged by: octocat"),
    );
  });

  it("ignores events from non-Jira sources", async () => {
    registerCrossPluginSync(mockCtx, mockClient, mockDb);

    hooks.emit("github:pr.merged", {
      issueId: "issue-1",
      externalId: "octocat/hello-world#42",
      source: "github", // Not jira
      pr: {
        number: 42,
        url: "https://github.com/octocat/hello-world/pull/42",
        mergedBy: "octocat",
        mergedAt: "2024-01-15T10:30:00Z",
      },
    });

    await hooks.flush();

    expect(mockClient.fetchIssue).not.toHaveBeenCalled();
    expect(mockClient.transitionIssue).not.toHaveBeenCalled();
  });

  it("ignores events when issue is not found", async () => {
    (mockDb.issues.getById as Mock).mockReturnValue(null);

    registerCrossPluginSync(mockCtx, mockClient, mockDb);

    hooks.emit("github:pr.merged", {
      issueId: "issue-1",
      externalId: "PROJ-123",
      source: "jira",
      pr: {
        number: 42,
        url: "https://github.com/octocat/hello-world/pull/42",
        mergedBy: "octocat",
        mergedAt: "2024-01-15T10:30:00Z",
      },
    });

    await hooks.flush();

    expect(mockClient.fetchIssue).not.toHaveBeenCalled();
  });

  it("finds QA transition by status name patterns", async () => {
    // Test various QA-related status names
    (mockClient.getTransitions as Mock).mockResolvedValue([
      { id: "1", name: "Start", to: { name: "In Progress", id: "2" } },
      { id: "2", name: "Ready", to: { name: "Ready for Testing", id: "3" } },
    ]);

    registerCrossPluginSync(mockCtx, mockClient, mockDb);

    hooks.emit("github:pr.merged", {
      issueId: "issue-1",
      externalId: "PROJ-123",
      source: "jira",
      pr: { number: 42, url: "url", mergedBy: "o", mergedAt: "t" },
    });

    await hooks.flush();

    // Should find "Ready for Testing" as it contains "testing"
    expect(mockClient.transitionIssue).toHaveBeenCalledWith("PROJ-123", "2");
  });

  it("emits jira:issue.transitioned hook after successful transition", async () => {
    const emitSpy = vi.spyOn(hooks, "emit");

    registerCrossPluginSync(mockCtx, mockClient, mockDb);

    hooks.emit("github:pr.merged", {
      issueId: "issue-1",
      externalId: "PROJ-123",
      source: "jira",
      pr: { number: 42, url: "url", mergedBy: "o", mergedAt: "t" },
    });

    await hooks.flush();

    expect(emitSpy).toHaveBeenCalledWith("jira:issue.transitioned", {
      issueId: "PROJ-123",
      from: "In Progress",
      to: "In QA",
    });
  });

  it("emits jira:issue.assigned hook after successful assignment", async () => {
    const emitSpy = vi.spyOn(hooks, "emit");

    registerCrossPluginSync(mockCtx, mockClient, mockDb);

    hooks.emit("github:pr.merged", {
      issueId: "issue-1",
      externalId: "PROJ-123",
      source: "jira",
      pr: { number: 42, url: "url", mergedBy: "o", mergedAt: "t" },
    });

    await hooks.flush();

    expect(emitSpy).toHaveBeenCalledWith("jira:issue.assigned", {
      issueId: "PROJ-123",
      from: "xyz789",
      to: "abc123",
    });
  });

  it("handles errors gracefully without crashing", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (mockClient.fetchIssue as Mock).mockRejectedValue(new Error("API Error"));

    registerCrossPluginSync(mockCtx, mockClient, mockDb);

    hooks.emit("github:pr.merged", {
      issueId: "issue-1",
      externalId: "PROJ-123",
      source: "jira",
      pr: { number: 42, url: "url", mergedBy: "o", mergedAt: "t" },
    });

    await hooks.flush();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Cross-plugin sync failed"),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });
});
