import type { AgentSystemInstruction } from "../types.ts";

export interface ResumeSystemInstruction extends AgentSystemInstruction {
  sessionSummary?: string;
  recentActivity?: Array<{ timestamp: string; description: string }>;
  keyDecisions?: string[];
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
  lines.push("");

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
