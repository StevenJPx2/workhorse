import { describe, test, expect } from "bun:test";
import {
  generateSystemPrompt,
  generateInitialPrompt,
  generateResumePrompt,
  type ResumeSystemInstruction,
} from "../system-prompt/index.ts";
import type { AgentSystemInstruction } from "../types.ts";

describe("System Prompt", () => {
  const baseInfo: AgentSystemInstruction = {
    ticketId: "AM-123",
    jiraKey: "AM-123",
    summary: "Fix authentication bug",
    description: "Users are getting logged out unexpectedly",
    worktreePath: "/code/repo-worktrees/AM-123",
    branchName: "fix/AM-123",
  };

  describe("generateSystemPrompt", () => {
    test("includes ticket key", () => {
      const prompt = generateSystemPrompt(baseInfo);
      expect(prompt).toContain("AM-123");
    });

    test("includes summary when provided", () => {
      const prompt = generateSystemPrompt(baseInfo);
      expect(prompt).toContain("Fix authentication bug");
    });

    test("includes description when provided", () => {
      const prompt = generateSystemPrompt(baseInfo);
      expect(prompt).toContain("Users are getting logged out unexpectedly");
    });

    test("includes working environment", () => {
      const prompt = generateSystemPrompt(baseInfo);
      expect(prompt).toContain("Worktree:");
      expect(prompt).toContain("/code/repo-worktrees/AM-123");
      expect(prompt).toContain("Branch:");
      expect(prompt).toContain("fix/AM-123");
    });

    test("includes jiratown tool instructions", () => {
      const prompt = generateSystemPrompt(baseInfo);
      expect(prompt).toContain("jiratown_get_notifications");
      expect(prompt).toContain("jiratown_update_status");
      expect(prompt).toContain("jiratown_escalate");
      expect(prompt).toContain("jiratown_acknowledge");
    });

    test("includes PR workflow with Jira update instructions", () => {
      const prompt = generateSystemPrompt(baseInfo);
      expect(prompt).toContain("jiratown_open_pr");
      expect(prompt).toContain("IMPORTANT: Update Jira after PR creation");
      expect(prompt).toContain("mcp_atlassian_addCommentToJiraIssue");
      expect(prompt).toContain("mcp_atlassian_transitionJiraIssue");
      expect(prompt).toContain("mcp_atlassian_getTransitionsForJiraIssue");
    });

    test("handles null summary", () => {
      const info = { ...baseInfo, summary: null };
      const prompt = generateSystemPrompt(info);
      expect(prompt).not.toContain("**Summary:**");
    });

    test("handles null description", () => {
      const info = { ...baseInfo, description: null };
      const prompt = generateSystemPrompt(info);
      expect(prompt).not.toContain("**Description:**");
    });
  });

  describe("generateInitialPrompt", () => {
    test("starts with ticket command", () => {
      const prompt = generateInitialPrompt(baseInfo);
      expect(prompt).toContain("/ticket AM-123");
    });

    test("includes summary", () => {
      const prompt = generateInitialPrompt(baseInfo);
      expect(prompt).toContain("**Summary:** Fix authentication bug");
    });

    test("includes description", () => {
      const prompt = generateInitialPrompt(baseInfo);
      expect(prompt).toContain("Description:");
      expect(prompt).toContain("Users are getting logged out unexpectedly");
    });

    test("instructs to call get_notifications", () => {
      const prompt = generateInitialPrompt(baseInfo);
      expect(prompt).toContain("jiratown_get_notifications");
      expect(prompt).toContain("planning");
    });

    test("handles null summary", () => {
      const info = { ...baseInfo, summary: null };
      const prompt = generateInitialPrompt(info);
      expect(prompt).not.toContain("**Summary:**");
    });

    test("no context branch - shows guidance when no summary or description", () => {
      const info = { ...baseInfo, summary: null, description: null };
      const prompt = generateInitialPrompt(info);
      expect(prompt).toContain("No ticket context available yet");
      expect(prompt).toContain("First Steps");
    });

    test("no context branch - includes jiraUrl when provided", () => {
      const info = {
        ...baseInfo,
        summary: null,
        description: null,
        jiraUrl: "https://company.atlassian.net/browse/AM-123",
      };
      const prompt = generateInitialPrompt(info);
      expect(prompt).toContain("Ticket URL:");
    });

    test("no context branch - includes jiraCloudId in MCP call when provided", () => {
      const info = {
        ...baseInfo,
        summary: null,
        description: null,
        jiraCloudId: "company.atlassian.net",
      };
      const prompt = generateInitialPrompt(info);
      expect(prompt).toContain("company.atlassian.net");
      expect(prompt).toContain("mcp_atlassian_getJiraIssue");
    });

    test("no context branch - uses jiraUrl to extract cloudId when no jiraCloudId", () => {
      const info = {
        ...baseInfo,
        summary: null,
        description: null,
        jiraCloudId: undefined,
        jiraUrl: "https://company.atlassian.net/browse/AM-123",
      };
      const prompt = generateInitialPrompt(info);
      expect(prompt).toContain("company.atlassian.net");
    });

    test("no context branch - fallback when neither jiraCloudId nor jiraUrl", () => {
      const info = {
        ...baseInfo,
        summary: null,
        description: null,
        jiraCloudId: undefined,
        jiraUrl: undefined,
      };
      const prompt = generateInitialPrompt(info);
      expect(prompt).toContain("mcp_atlassian_getJiraIssue");
      expect(prompt).toContain("AM-123");
    });

    test("no context branch - handles jiraUrl without valid cloudId extraction", () => {
      const info = {
        ...baseInfo,
        summary: null,
        description: null,
        jiraCloudId: undefined,
        jiraUrl: "not-a-valid-url",
      };
      const prompt = generateInitialPrompt(info);
      expect(prompt).toContain("mcp_atlassian_getJiraIssue");
    });
  });

  describe("generateResumePrompt", () => {
    const resumeInfo: ResumeSystemInstruction = {
      ...baseInfo,
      sessionSummary: "Working on authentication fix",
      recentActivity: [
        { timestamp: "2025-01-01T10:00:00Z", description: "Started implementation" },
        { timestamp: "2025-01-01T10:30:00Z", description: "Fixed login timeout" },
      ],
      keyDecisions: ["Use exponential backoff", "Config via env var"],
    };

    test("starts with resume command", () => {
      const prompt = generateResumePrompt(resumeInfo);
      expect(prompt).toContain("/resume AM-123");
    });

    test("includes resuming context message", () => {
      const prompt = generateResumePrompt(resumeInfo);
      expect(prompt).toContain("resuming work");
      expect(prompt).toContain("previous context");
    });

    test("includes ticket summary", () => {
      const prompt = generateResumePrompt(resumeInfo);
      expect(prompt).toContain("Ticket Summary");
      expect(prompt).toContain("Fix authentication bug");
    });

    test("includes session summary", () => {
      const prompt = generateResumePrompt(resumeInfo);
      expect(prompt).toContain("Previous Session Summary");
      expect(prompt).toContain("Working on authentication fix");
    });

    test("includes recent activity", () => {
      const prompt = generateResumePrompt(resumeInfo);
      expect(prompt).toContain("Recent Activity");
      expect(prompt).toContain("Started implementation");
      expect(prompt).toContain("Fixed login timeout");
    });

    test("includes key decisions", () => {
      const prompt = generateResumePrompt(resumeInfo);
      expect(prompt).toContain("Key Decisions Made");
      expect(prompt).toContain("Use exponential backoff");
      expect(prompt).toContain("Config via env var");
    });

    test("includes working environment", () => {
      const prompt = generateResumePrompt(resumeInfo);
      expect(prompt).toContain("Working Environment");
      expect(prompt).toContain("Worktree:");
      expect(prompt).toContain("Branch:");
    });

    test("instructs to check notifications and continue", () => {
      const prompt = generateResumePrompt(resumeInfo);
      expect(prompt).toContain("Continue from where you left off");
      expect(prompt).toContain("jiratown_get_notifications");
    });

    test("handles missing session summary", () => {
      const info = { ...resumeInfo, sessionSummary: undefined };
      const prompt = generateResumePrompt(info);
      expect(prompt).not.toContain("Previous Session Summary");
    });

    test("handles empty recent activity", () => {
      const info = { ...resumeInfo, recentActivity: [] };
      const prompt = generateResumePrompt(info);
      expect(prompt).not.toContain("Recent Activity");
    });

    test("handles missing key decisions", () => {
      const info = { ...resumeInfo, keyDecisions: undefined };
      const prompt = generateResumePrompt(info);
      expect(prompt).not.toContain("Key Decisions Made");
    });

    test("limits recent activity to 10 items", () => {
      const manyEvents = Array.from({ length: 15 }, (_, i) => ({
        timestamp: `2025-01-01T${i}:00:00Z`,
        description: `Event ${i}`,
      }));
      const info = { ...resumeInfo, recentActivity: manyEvents };
      const prompt = generateResumePrompt(info);

      expect(prompt).toContain("Event 0");
      expect(prompt).toContain("Event 9");
      expect(prompt).not.toContain("Event 10");
    });
  });
});
