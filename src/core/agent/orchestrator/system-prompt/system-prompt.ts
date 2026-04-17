/**
 * System prompt generation for agents
 *
 * Generates the initial system instruction that tells the agent
 * about the ticket they're working on.
 */

import type { AgentSystemInstruction } from "../types.ts";

/**
 * Generate a system prompt for an agent starting work on a ticket
 */
export function generateSystemPrompt(info: AgentSystemInstruction): string {
  const lines: string[] = [`You are working on Jira ticket ${info.jiraKey}.`, ""];

  if (info.summary) {
    lines.push(`**Summary:** ${info.summary}`);
    lines.push("");
  }

  if (info.description) {
    lines.push("**Description:**");
    lines.push(info.description);
    lines.push("");
  }

  lines.push("**Working Environment:**");
  lines.push(`- Worktree: ${info.worktreePath}`);
  lines.push(`- Branch: ${info.branchName}`);
  lines.push("");

  lines.push("**Important - Use Jiratown MCP Tools:**");
  lines.push("- Use `jiratown_get_notifications` to check for updates from Jira or PR reviews");
  lines.push(
    "- Use `jiratown_update_status` to report progress: planning → implementing → testing → pr_created → in_review → done",
  );
  lines.push(
    "- **IMPORTANT: Call `jiratown_update_status` with status='done' when the ticket is complete** (PR merged, QA verified, etc.)",
  );
  lines.push("- Use `jiratown_escalate` if you need clarification or are blocked");
  lines.push("- Acknowledge notifications with `jiratown_acknowledge` after handling them");
  lines.push("");

  lines.push("**Completing Implementation - PR Workflow:**");
  lines.push("When you have finished implementing the solution:");
  lines.push("");
  lines.push("1. **Commit your changes** - Use clear, descriptive commit messages");
  lines.push("2. **Push your branch** - Ensure all changes are pushed to the remote");
  lines.push(
    "3. **Open a Pull Request** - **MUST use `jiratown_open_pr`** (do NOT use `gh pr create` directly!) with a descriptive title (include the Jira key) and body summarizing:",
  );
  lines.push("   - What was implemented");
  lines.push("   - Key changes made");
  lines.push("   - How to test the changes");
  lines.push("   - Any relevant context for reviewers");
  lines.push("");
  lines.push(
    "**CRITICAL:** Always use `jiratown_open_pr` instead of `gh pr create`. This tool updates the local ticket status to `pr_created` and stores the PR URL so Jiratown can track the PR.",
  );
  lines.push("");
  lines.push(
    "4. **IMPORTANT: Update Jira after PR creation** - After `jiratown_open_pr` succeeds:",
  );
  lines.push(
    "   - Use `mcp_atlassian_addCommentToJiraIssue` to post a comment with the PR URL and summary of changes",
  );
  lines.push(
    "   - Use `mcp_atlassian_transitionJiraIssue` to move the ticket to the appropriate status (e.g., 'In Review', 'Code Review')",
  );
  lines.push(
    "   - First call `mcp_atlassian_getTransitionsForJiraIssue` to find available transitions if unsure",
  );
  lines.push("");
  lines.push("**Handling PR Reviews:**");
  lines.push(
    "- After PR creation, check `jiratown_get_notifications` periodically for review feedback",
  );
  lines.push("- Address reviewer comments by making changes and pushing new commits");
  lines.push("- Reply to review comments explaining your changes");
  lines.push("- When approved and merged, call `jiratown_update_status` with status='done'");

  // Add custom project-specific prompt if configured
  if (info.customPrompt) {
    lines.push("");
    lines.push("**Project-Specific Instructions:**");
    lines.push(info.customPrompt);
  }

  return lines.join("\n");
}

/**
 * Generate the initial command to send to the agent
 *
 * This is the text that will be sent to the agent via tmux send-keys
 * to start the work on the ticket.
 *
 * If summary/description is provided, injects the context directly.
 * Otherwise, provides guidance to fetch ticket details from Jira.
 */
export function generateInitialPrompt(info: AgentSystemInstruction): string {
  const lines: string[] = [];

  lines.push(`/ticket ${info.jiraKey}`);
  lines.push("");

  // Check if we have existing context (summary/description)
  const hasContext = info.summary || info.description;

  if (hasContext) {
    // Inject the existing context
    if (info.summary) {
      lines.push(`**Summary:** ${info.summary}`);
    }

    if (info.description) {
      lines.push("");
      lines.push("**Description:**");
      lines.push(info.description);
    }

    lines.push("");
    lines.push(
      "Please start by calling jiratown_get_notifications to check for any updates, then begin planning the implementation.",
    );
  } else {
    // No context - guide the agent to fetch it from Jira
    lines.push("**No ticket context available yet.**");
    lines.push("");

    if (info.jiraUrl) {
      lines.push(`Ticket URL: ${info.jiraUrl}`);
      lines.push("");
    }

    lines.push("**First Steps:**");
    lines.push("1. Use the Atlassian MCP to fetch the ticket details:");

    if (info.jiraCloudId) {
      lines.push(
        `   - Call \`mcp_atlassian_getJiraIssue\` with cloudId: "${info.jiraCloudId}" and issueIdOrKey: "${info.jiraKey}"`,
      );
    } else if (info.jiraUrl) {
      // Extract cloudId from URL (e.g., "https://company.atlassian.net/browse/AM-123")
      const urlMatch = info.jiraUrl.match(/https?:\/\/([^/]+)/);
      if (urlMatch) {
        lines.push(
          `   - Call \`mcp_atlassian_getJiraIssue\` with cloudId: "${urlMatch[1]}" and issueIdOrKey: "${info.jiraKey}"`,
        );
      } else {
        lines.push(
          `   - Call \`mcp_atlassian_getJiraIssue\` with the appropriate cloudId and issueIdOrKey: "${info.jiraKey}"`,
        );
      }
    } else {
      lines.push(
        `   - Call \`mcp_atlassian_getJiraIssue\` with the appropriate cloudId and issueIdOrKey: "${info.jiraKey}"`,
      );
    }

    lines.push("2. Review the ticket summary, description, and acceptance criteria");
    lines.push("3. Check jiratown_get_notifications for any additional context or updates");
    lines.push("4. Begin planning the implementation");
  }

  return lines.join("\n");
}

export { generateResumePrompt } from "./resume-prompt.ts";
export type { ResumeSystemInstruction } from "./resume-prompt.ts";
