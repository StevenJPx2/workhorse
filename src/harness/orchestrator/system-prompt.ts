/**
 * System prompt generation for agents
 *
 * Generates the initial system instruction that tells the agent
 * about the ticket they're working on.
 */

import type { AgentSystemInstruction } from "./types.ts";

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
 */
export function generateInitialPrompt(info: AgentSystemInstruction): string {
  const lines: string[] = [];

  lines.push(`/ticket ${info.jiraKey}`);
  lines.push("");

  if (info.summary) {
    lines.push(`Summary: ${info.summary}`);
  }

  if (info.description) {
    lines.push("");
    lines.push("Description:");
    lines.push(info.description);
  }

  lines.push("");
  lines.push(
    "Please start by calling jiratown_get_notifications to check for any existing context, then begin planning the implementation."
  );

  return lines.join("\n");
}
