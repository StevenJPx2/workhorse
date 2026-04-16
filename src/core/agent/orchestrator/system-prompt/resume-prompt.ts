import type { AgentSystemInstruction } from "../types.ts";

/**
 * Extended instruction for resuming agent with context
 */
export interface ResumeSystemInstruction extends AgentSystemInstruction {
  sessionSummary?: string;
  recentActivity?: Array<{ timestamp: string; description: string }>;
  keyDecisions?: string[];
  /** Fresh GitHub PR context (formatted summary) */
  prContextSummary?: string;
  /** Fresh Jira ticket context (formatted summary) */
  jiraContextSummary?: string;
}

export function generateResumePrompt(info: ResumeSystemInstruction): string {
  const lines: string[] = [];

  lines.push(`/resume ${info.jiraKey}`);
  lines.push("");
  lines.push("You are resuming work on this ticket. Here is your previous context:");
  lines.push("");

  if (info.jiraUrl) {
    lines.push(`## Ticket Reference`);
    lines.push(`- Jira URL: ${info.jiraUrl}`);
    if (info.jiraCloudId) {
      lines.push(`- Cloud ID: ${info.jiraCloudId}`);
    }
    lines.push("");
  }

  if (info.summary) {
    lines.push(`## Ticket Summary`);
    lines.push(info.summary);
    lines.push("");
  }

  if (info.sessionSummary) {
    lines.push("## Previous Session Summary");
    lines.push(info.sessionSummary);
    lines.push("");
  }

  if (info.recentActivity && info.recentActivity.length > 0) {
    lines.push("## Recent Activity (Last Session)");
    for (const event of info.recentActivity.slice(0, 10)) {
      lines.push(`- [${event.timestamp}] ${event.description}`);
    }
    lines.push("");
  }

  if (info.keyDecisions && info.keyDecisions.length > 0) {
    lines.push("## Key Decisions Made");
    for (const decision of info.keyDecisions) {
      lines.push(`- ${decision}`);
    }
    lines.push("");
  }

  lines.push("## Working Environment");
  lines.push(`- Worktree: ${info.worktreePath}`);
  lines.push(`- Branch: ${info.branchName}`);
  if (info.status) {
    lines.push(`- Status: ${info.status}`);
  }
  if (info.prUrl) {
    lines.push(`- PR URL: ${info.prUrl}`);
  }
  lines.push("");

  // Fresh PR context from GitHub (if available)
  if (info.prContextSummary) {
    lines.push("## Current PR State (fetched just now)");
    lines.push(info.prContextSummary);
    lines.push("");
  }

  // Fresh Jira context (if available)
  if (info.jiraContextSummary) {
    lines.push("## Current Jira State (fetched just now)");
    lines.push(info.jiraContextSummary);
    lines.push("");
  }

  lines.push("## Jiratown MCP Tools");
  lines.push("- `jiratown_get_notifications` - Check for updates from Jira or PR reviews");
  lines.push(
    "- `jiratown_update_status` - Report progress: planning → implementing → testing → pr_created → in_review → done",
  );
  lines.push("- `jiratown_escalate` - Request clarification if blocked");
  lines.push("- `jiratown_acknowledge` - Acknowledge handled notifications");
  lines.push("");
  lines.push(
    "**IMPORTANT: If this ticket is already complete (PR merged, QA verified), call `jiratown_update_status` with status='done' to mark it complete.**",
  );
  lines.push("");

  lines.push(
    "Continue from where you left off. Check jiratown_get_notifications for any new updates, then proceed with the implementation.",
  );

  return lines.join("\n");
}
