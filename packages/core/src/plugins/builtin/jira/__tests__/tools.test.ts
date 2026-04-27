/**
 * Tests for Jira tools.
 */

import { describe, expect, it, vi } from "vitest";
import type { AtlassianClient } from "../client.ts";
import { createJiraTools } from "../tools.ts";

describe("createJiraTools", () => {
  it("returns add_comment and transition tools", () => {
    const mockClient = {} as AtlassianClient;
    const tools = createJiraTools(mockClient);
    expect(tools).toHaveLength(2);
    expect(tools[0]!.name).toBe("jira_add_comment");
    expect(tools[1]!.name).toBe("jira_transition_issue");
  });
});

describe("jira_add_comment tool", () => {
  it("adds a comment successfully", async () => {
    const mockClient = {
      addComment: vi.fn().mockResolvedValue(undefined),
    } as unknown as AtlassianClient;

    const tools = createJiraTools(mockClient);
    const addCommentTool = tools.find((t) => t.name === "jira_add_comment")!;

    const result = await addCommentTool.execute(
      { ticketKey: "AM-123", body: "LGTM" },
      {
        issueId: "AM-123",
        worktreePath: "/tmp",
        db: {} as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(mockClient.addComment).toHaveBeenCalledWith("AM-123", "LGTM");
    expect(result.success).toBe(true);
  });

  it("returns error on failure", async () => {
    const mockClient = {
      addComment: vi.fn().mockRejectedValue(new Error("Network error")),
    } as unknown as AtlassianClient;

    const tools = createJiraTools(mockClient);
    const addCommentTool = tools.find((t) => t.name === "jira_add_comment")!;

    const result = await addCommentTool.execute(
      { ticketKey: "AM-123", body: "LGTM" },
      {
        issueId: "AM-123",
        worktreePath: "/tmp",
        db: {} as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Network error");
  });
});

describe("jira_transition_issue tool", () => {
  it("transitions an issue successfully", async () => {
    const mockClient = {
      getTransitions: vi.fn().mockResolvedValue([
        { id: "31", name: "In Progress", to: { name: "In Progress", id: "3" } },
        { id: "41", name: "Done", to: { name: "Done", id: "6" } },
      ]),
      transitionIssue: vi.fn().mockResolvedValue(undefined),
    } as unknown as AtlassianClient;

    const tools = createJiraTools(mockClient);
    const transitionTool = tools.find((t) => t.name === "jira_transition_issue")!;

    const result = await transitionTool.execute(
      { ticketKey: "AM-123", status: "Done" },
      {
        issueId: "AM-123",
        worktreePath: "/tmp",
        db: {} as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(mockClient.getTransitions).toHaveBeenCalledWith("AM-123");
    expect(mockClient.transitionIssue).toHaveBeenCalledWith("AM-123", "41");
    expect(result.success).toBe(true);
    expect(result.output).toContain("Done");
  });

  it("returns error when no matching transition found", async () => {
    const mockClient = {
      getTransitions: vi
        .fn()
        .mockResolvedValue([
          { id: "31", name: "In Progress", to: { name: "In Progress", id: "3" } },
        ]),
      transitionIssue: vi.fn(),
    } as unknown as AtlassianClient;

    const tools = createJiraTools(mockClient);
    const transitionTool = tools.find((t) => t.name === "jira_transition_issue")!;

    const result = await transitionTool.execute(
      { ticketKey: "AM-123", status: "Blocked" },
      {
        issueId: "AM-123",
        worktreePath: "/tmp",
        db: {} as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("No transition found");
  });
});
