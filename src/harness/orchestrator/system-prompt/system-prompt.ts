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
  const lines: string[] = [
    `You are working on Jira ticket ${info.jiraKey}.`,
    "",
  ];

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

  lines.push("**Important:**");
  lines.push(
    "- Use `jiratown_get_notifications` to check for updates from Jira or PR reviews"
  );
  lines.push(
    "- Use `jiratown_update_status` to report progress (planning, implementing, etc.)"
  );
  lines.push(
    "- Use `jiratown_escalate` if you need clarification or are blocked"
  );
  lines.push(
    "- Acknowledge notifications with `jiratown_acknowledge` after handling them"
  );

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
      "Please start by calling jiratown_get_notifications to check for any updates, then begin planning the implementation."
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
        `   - Call \`mcp_atlassian_getJiraIssue\` with cloudId: "${info.jiraCloudId}" and issueIdOrKey: "${info.jiraKey}"`
      );
    } else if (info.jiraUrl) {
      // Extract cloudId from URL (e.g., "https://company.atlassian.net/browse/AM-123")
      const urlMatch = info.jiraUrl.match(/https?:\/\/([^/]+)/);
      if (urlMatch) {
        lines.push(
          `   - Call \`mcp_atlassian_getJiraIssue\` with cloudId: "${urlMatch[1]}" and issueIdOrKey: "${info.jiraKey}"`
        );
      } else {
        lines.push(
          `   - Call \`mcp_atlassian_getJiraIssue\` with the appropriate cloudId and issueIdOrKey: "${info.jiraKey}"`
        );
      }
    } else {
      lines.push(
        `   - Call \`mcp_atlassian_getJiraIssue\` with the appropriate cloudId and issueIdOrKey: "${info.jiraKey}"`
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
