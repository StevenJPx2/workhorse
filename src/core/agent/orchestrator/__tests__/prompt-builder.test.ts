/**
 * Tests for prompt-builder
 *
 * Tests the logic of which prompt type to use (initial vs resume)
 * based on session state. Uses dependency injection for testability.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { prepareAgentPrompt, type PromptBuilderDeps } from "./prompt-builder.ts";
import type { SessionMemory } from "../../session/session-memory.ts";

const baseCtx = {
  ticketId: "TEST-123",
  agentType: "opencode" as const,
  worktreePath: "/worktree/TEST-123",
  worktreeBranch: "feat/TEST-123",
  jiraSummary: "Test ticket",
  jiraDescription: "Test description",
  jiraUrl: "https://jira.example.com/TEST-123",
  jiraCloudId: "cloud-id-123",
};

describe("prepareAgentPrompt", () => {
  let mockDeps: PromptBuilderDeps;

  beforeEach(() => {
    mockDeps = {
      hasSessionMemory: mock(() => false),
      readSessionMemory: mock(() => null),
      writeSessionMemory: mock(() => true),
      createSessionMemory: mock(() => ({
        ticketId: "TEST-123",
        status: "pending",
        agent: "opencode",
        branch: "feat/TEST-123",
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        summary: "Test ticket",
        recentActivity: [],
        keyDecisions: [],
      })),
      addSessionEvent: mock(() => true),
      orchestratorTrace: mock(() => {}),
    };
  });

  it("should generate initial prompt when no session memory", () => {
    (mockDeps.hasSessionMemory as ReturnType<typeof mock>).mockImplementation(() => false);

    const result = prepareAgentPrompt(baseCtx, mockDeps);

    // Should be a non-empty string (the initial prompt)
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    // Initial prompts start with /start
    expect(result).toContain("TEST-123");
  });

  it("should write session memory on fresh start", () => {
    (mockDeps.hasSessionMemory as ReturnType<typeof mock>).mockImplementation(() => false);

    prepareAgentPrompt(baseCtx, mockDeps);

    expect(mockDeps.createSessionMemory).toHaveBeenCalled();
    expect(mockDeps.writeSessionMemory).toHaveBeenCalled();
  });

  it("should trace fresh start", () => {
    (mockDeps.hasSessionMemory as ReturnType<typeof mock>).mockImplementation(() => false);

    prepareAgentPrompt(baseCtx, mockDeps);

    expect(mockDeps.orchestratorTrace).toHaveBeenCalledWith("TEST-123", "FRESH_START");
  });

  it("should generate resume prompt when session memory exists", () => {
    const existingMemory: SessionMemory = {
      ticketId: "TEST-123",
      status: "implementing",
      agent: "opencode",
      branch: "feat/TEST-123",
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      summary: "Working on feature",
      recentActivity: [
        { timestamp: "2024-01-01T00:00:00Z", type: "status_change", description: "Started" },
      ],
      keyDecisions: ["Use TypeScript"],
    };

    (mockDeps.hasSessionMemory as ReturnType<typeof mock>).mockImplementation(() => true);
    (mockDeps.readSessionMemory as ReturnType<typeof mock>).mockImplementation(
      () => existingMemory,
    );

    const result = prepareAgentPrompt(baseCtx, mockDeps);

    // Resume prompts contain /resume
    expect(typeof result).toBe("string");
    expect(result).toContain("/resume TEST-123");
    expect(result).toContain("Working on feature");
    expect(result).toContain("Use TypeScript");
  });

  it("should add session event on resume", () => {
    const existingMemory: SessionMemory = {
      ticketId: "TEST-123",
      status: "implementing",
      agent: "opencode",
      branch: "feat/TEST-123",
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      summary: "",
      recentActivity: [],
      keyDecisions: [],
    };

    (mockDeps.hasSessionMemory as ReturnType<typeof mock>).mockImplementation(() => true);
    (mockDeps.readSessionMemory as ReturnType<typeof mock>).mockImplementation(
      () => existingMemory,
    );

    prepareAgentPrompt(baseCtx, mockDeps);

    expect(mockDeps.addSessionEvent).toHaveBeenCalledWith(
      "/worktree/TEST-123",
      expect.objectContaining({
        type: "status_change",
        description: "Agent session resumed",
      }),
    );
  });

  it("should trace resuming session with memory", () => {
    const existingMemory: SessionMemory = {
      ticketId: "TEST-123",
      status: "implementing",
      agent: "opencode",
      branch: "feat/TEST-123",
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      summary: "",
      recentActivity: [{ timestamp: "t", type: "status_change", description: "d" }],
      keyDecisions: [],
    };

    (mockDeps.hasSessionMemory as ReturnType<typeof mock>).mockImplementation(() => true);
    (mockDeps.readSessionMemory as ReturnType<typeof mock>).mockImplementation(
      () => existingMemory,
    );

    prepareAgentPrompt(baseCtx, mockDeps);

    expect(mockDeps.orchestratorTrace).toHaveBeenCalledWith(
      "TEST-123",
      "RESUMING_SESSION",
      expect.objectContaining({
        lastStatus: "implementing",
        activityCount: 1,
      }),
    );
  });

  it("should handle null jiraSummary", () => {
    (mockDeps.hasSessionMemory as ReturnType<typeof mock>).mockImplementation(() => false);

    const result = prepareAgentPrompt({ ...baseCtx, jiraSummary: null }, mockDeps);

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("should handle null jiraDescription", () => {
    (mockDeps.hasSessionMemory as ReturnType<typeof mock>).mockImplementation(() => false);

    const result = prepareAgentPrompt({ ...baseCtx, jiraDescription: null }, mockDeps);

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("should handle claude agent type", () => {
    (mockDeps.hasSessionMemory as ReturnType<typeof mock>).mockImplementation(() => false);

    prepareAgentPrompt({ ...baseCtx, agentType: "claude" }, mockDeps);

    expect(mockDeps.createSessionMemory).toHaveBeenCalledWith(
      "TEST-123",
      "pending",
      "claude",
      expect.any(String),
      expect.any(String),
    );
  });

  it("should pass jiraSummary to createSessionMemory", () => {
    (mockDeps.hasSessionMemory as ReturnType<typeof mock>).mockImplementation(() => false);

    prepareAgentPrompt({ ...baseCtx, jiraSummary: "My ticket summary" }, mockDeps);

    expect(mockDeps.createSessionMemory).toHaveBeenCalledWith(
      "TEST-123",
      "pending",
      "opencode",
      "feat/TEST-123",
      "My ticket summary",
    );
  });

  it("should handle undefined jiraUrl and jiraCloudId", () => {
    (mockDeps.hasSessionMemory as ReturnType<typeof mock>).mockImplementation(() => false);

    const result = prepareAgentPrompt(
      {
        ...baseCtx,
        jiraUrl: undefined,
        jiraCloudId: undefined,
      },
      mockDeps,
    );

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("TEST-123");
  });
});
