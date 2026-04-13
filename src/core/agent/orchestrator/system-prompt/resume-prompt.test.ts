/**
 * Tests for resume-prompt.ts - pure prompt generation function
 */

import { describe, it, expect } from "bun:test";
import { generateResumePrompt } from "./resume-prompt.ts";

describe("generateResumePrompt", () => {
  const baseInfo = {
    ticketId: "am-123-uuid",
    jiraKey: "AM-123",
    summary: null,
    description: null,
    worktreePath: "/home/user/worktrees/AM-123",
    branchName: "feat/AM-123",
  };

  it("should generate a basic prompt with required fields", () => {
    const result = generateResumePrompt(baseInfo);

    expect(result).toContain("/resume AM-123");
    expect(result).toContain("Worktree: /home/user/worktrees/AM-123");
    expect(result).toContain("Branch: feat/AM-123");
  });

  it("should include ticket reference when jiraUrl is provided", () => {
    const info = { ...baseInfo, jiraUrl: "https://company.atlassian.net/browse/AM-123" };
    const result = generateResumePrompt(info);

    expect(result).toContain("## Ticket Reference");
    expect(result).toContain("Jira URL: https://company.atlassian.net/browse/AM-123");
  });

  it("should include cloud ID when both jiraUrl and jiraCloudId are provided", () => {
    const info = {
      ...baseInfo,
      jiraUrl: "https://company.atlassian.net/browse/AM-123",
      jiraCloudId: "company.atlassian.net",
    };
    const result = generateResumePrompt(info);

    expect(result).toContain("Cloud ID: company.atlassian.net");
  });

  it("should not include cloud ID when jiraUrl is missing", () => {
    const info = { ...baseInfo, jiraCloudId: "company.atlassian.net" };
    const result = generateResumePrompt(info);

    expect(result).not.toContain("Cloud ID:");
    expect(result).not.toContain("## Ticket Reference");
  });

  it("should include ticket summary when provided", () => {
    const info = { ...baseInfo, summary: "Fix authentication bug in login flow" };
    const result = generateResumePrompt(info);

    expect(result).toContain("## Ticket Summary");
    expect(result).toContain("Fix authentication bug in login flow");
  });

  it("should not include ticket summary section when summary is absent", () => {
    const result = generateResumePrompt(baseInfo);

    expect(result).not.toContain("## Ticket Summary");
  });

  it("should include session summary when provided", () => {
    const info = { ...baseInfo, sessionSummary: "Completed API endpoints, working on tests" };
    const result = generateResumePrompt(info);

    expect(result).toContain("## Previous Session Summary");
    expect(result).toContain("Completed API endpoints, working on tests");
  });

  it("should not include session summary section when absent", () => {
    const result = generateResumePrompt(baseInfo);

    expect(result).not.toContain("## Previous Session Summary");
  });

  it("should include recent activity when provided", () => {
    const info = {
      ...baseInfo,
      recentActivity: [
        { timestamp: "2024-01-01T10:00:00.000Z", description: "Created auth module" },
        { timestamp: "2024-01-01T11:00:00.000Z", description: "Fixed login redirect" },
      ],
    };
    const result = generateResumePrompt(info);

    expect(result).toContain("## Recent Activity (Last Session)");
    expect(result).toContain("- [2024-01-01T10:00:00.000Z] Created auth module");
    expect(result).toContain("- [2024-01-01T11:00:00.000Z] Fixed login redirect");
  });

  it("should limit recent activity to 10 items", () => {
    const activity = Array.from({ length: 15 }, (_, i) => ({
      timestamp: `2024-01-01T${String(i).padStart(2, "0")}:00:00.000Z`,
      description: `Activity ${i}`,
    }));
    const info = { ...baseInfo, recentActivity: activity };
    const result = generateResumePrompt(info);

    // Should have at most 10 activity entries
    const matches = result.match(/- \[2024-01-01T/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeLessThanOrEqual(10);
  });

  it("should not include recent activity section when empty array", () => {
    const info = { ...baseInfo, recentActivity: [] };
    const result = generateResumePrompt(info);

    expect(result).not.toContain("## Recent Activity (Last Session)");
  });

  it("should include key decisions when provided", () => {
    const info = {
      ...baseInfo,
      keyDecisions: ["Use JWT for authentication", "Store sessions in Redis"],
    };
    const result = generateResumePrompt(info);

    expect(result).toContain("## Key Decisions Made");
    expect(result).toContain("- Use JWT for authentication");
    expect(result).toContain("- Store sessions in Redis");
  });

  it("should not include key decisions section when empty array", () => {
    const info = { ...baseInfo, keyDecisions: [] };
    const result = generateResumePrompt(info);

    expect(result).not.toContain("## Key Decisions Made");
  });

  it("should include MCP tools section", () => {
    const result = generateResumePrompt(baseInfo);

    expect(result).toContain("## Jiratown MCP Tools");
    expect(result).toContain("jiratown_get_notifications");
    expect(result).toContain("jiratown_update_status");
    expect(result).toContain("jiratown_escalate");
    expect(result).toContain("jiratown_acknowledge");
  });

  it("should include working environment section", () => {
    const result = generateResumePrompt(baseInfo);

    expect(result).toContain("## Working Environment");
  });

  it("should include IMPORTANT note about completion", () => {
    const result = generateResumePrompt(baseInfo);

    expect(result).toContain("IMPORTANT");
    expect(result).toContain("jiratown_update_status");
    expect(result).toContain("done");
  });

  it("should include continuation instruction", () => {
    const result = generateResumePrompt(baseInfo);

    expect(result).toContain("Continue from where you left off");
  });

  it("should handle all fields together", () => {
    const info = {
      ticketId: "proj-456-uuid",
      jiraKey: "PROJ-456",
      description: null,
      worktreePath: "/tmp/worktree/PROJ-456",
      branchName: "feature/PROJ-456-payment",
      jiraUrl: "https://myco.atlassian.net/browse/PROJ-456",
      jiraCloudId: "myco.atlassian.net",
      summary: "Add payment processing",
      sessionSummary: "Integrated Stripe API",
      recentActivity: [
        { timestamp: "2024-01-02T09:00:00.000Z", description: "Added Stripe webhook handler" },
      ],
      keyDecisions: ["Use Stripe webhooks for payment confirmation"],
    };

    const result = generateResumePrompt(info);

    expect(result).toContain("/resume PROJ-456");
    expect(result).toContain("PROJ-456-payment");
    expect(result).toContain("## Ticket Reference");
    expect(result).toContain("## Ticket Summary");
    expect(result).toContain("## Previous Session Summary");
    expect(result).toContain("## Recent Activity (Last Session)");
    expect(result).toContain("## Key Decisions Made");
  });

  it("should return a string", () => {
    const result = generateResumePrompt(baseInfo);
    expect(typeof result).toBe("string");
  });
});
