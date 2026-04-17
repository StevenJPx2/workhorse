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

  it("should include status when provided", () => {
    const info = { ...baseInfo, status: "implementing" };
    const result = generateResumePrompt(info);

    expect(result).toContain("Status: implementing");
  });

  it("should include PR URL when provided", () => {
    const info = { ...baseInfo, prUrl: "https://github.com/owner/repo/pull/123" };
    const result = generateResumePrompt(info);

    expect(result).toContain("PR URL: https://github.com/owner/repo/pull/123");
  });

  it("should include both status and PR URL in pr_created state", () => {
    const info = {
      ...baseInfo,
      status: "pr_created",
      prUrl: "https://github.com/owner/repo/pull/456",
    };
    const result = generateResumePrompt(info);

    expect(result).toContain("Status: pr_created");
    expect(result).toContain("PR URL: https://github.com/owner/repo/pull/456");
  });

  it("should not include status line when status is not provided", () => {
    const result = generateResumePrompt(baseInfo);
    expect(result).not.toContain("Status:");
  });

  it("should not include PR URL line when prUrl is not provided", () => {
    const result = generateResumePrompt(baseInfo);
    expect(result).not.toContain("PR URL:");
  });

  it("should include PR context summary when provided", () => {
    const info = {
      ...baseInfo,
      prContextSummary: `## PR #123: Fix authentication bug

**Status:** 🟢 OPEN
**Review Decision:** 🔄 CHANGES REQUESTED
**Mergeable:** Yes ✓
**Changes:** 3 commits, 5 files (+120/-45)

### Reviews
- 🔄 **reviewer1**: CHANGES REQUESTED
  > Please add error handling for the edge case`,
    };
    const result = generateResumePrompt(info);

    expect(result).toContain("## Current PR State (fetched just now)");
    expect(result).toContain("PR #123: Fix authentication bug");
    expect(result).toContain("CHANGES REQUESTED");
    expect(result).toContain("Please add error handling");
  });

  it("should not include PR context section when prContextSummary is not provided", () => {
    const result = generateResumePrompt(baseInfo);
    expect(result).not.toContain("## Current PR State");
  });

  it("should include Jira context summary when provided", () => {
    const info = {
      ...baseInfo,
      jiraContextSummary: `**Status:** In Review
**Assignee:** John Doe
**Reporter:** Jane Smith

### Recent Comments
- **Jane Smith** (2024-01-15): Can you also handle the mobile viewport?`,
    };
    const result = generateResumePrompt(info);

    expect(result).toContain("## Current Jira State (fetched just now)");
    expect(result).toContain("In Review");
    expect(result).toContain("Can you also handle the mobile viewport?");
  });

  it("should not include Jira context section when jiraContextSummary is not provided", () => {
    const result = generateResumePrompt(baseInfo);
    expect(result).not.toContain("## Current Jira State");
  });

  it("should include both PR and Jira context when both are provided", () => {
    const info = {
      ...baseInfo,
      prContextSummary: "PR summary content",
      jiraContextSummary: "Jira summary content",
    };
    const result = generateResumePrompt(info);

    expect(result).toContain("## Current PR State (fetched just now)");
    expect(result).toContain("PR summary content");
    expect(result).toContain("## Current Jira State (fetched just now)");
    expect(result).toContain("Jira summary content");
  });
});
