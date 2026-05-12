/**
 * Jira prompt enrichment for the PromptEngineer.
 *
 * Hooks `prompt.building` to add Jira state and workflow context blocks.
 *
 * @module @jiratown/plugin-jira/prompt
 */

import type { JiratownContext, PromptContextBlock } from "@jiratown/core";
import type { AtlassianClient } from "./client.ts";

/** Register prompt enrichment hooks */
export function registerPromptHooks(ctx: JiratownContext, client: AtlassianClient): void {
  ctx.hooks.on("prompt.building", async ({ issueId, context }) => {
    const issue = await ctx.db.issues.getById(issueId);
    if (!issue || issue.source !== "jira") return;

    try {
      context.contextBlocks.push(
        ...buildJiraContextBlocks(await client.fetchIssue(issue.externalId)),
      );
    } catch {
      // Silently skip if Jira API fails
    }
  });
}

/** Build Jira context blocks for the prompt */
function buildJiraContextBlocks(jiraIssue: {
  key: string;
  fields: Record<string, unknown>;
}): PromptContextBlock[] {
  const fields = jiraIssue.fields;
  const contextBlocks: PromptContextBlock[] = [];

  contextBlocks.push({
    id: "jira-state",
    title: "Jira State",
    priority: 10,
    content: [
      `**Key:** ${jiraIssue.key}`,
      `**Summary:** ${(fields.summary as string) ?? ""}`,
      `**Status:** ${(fields.status as { name: string })?.name ?? ""}`,
      `**Priority:** ${(fields.priority as { name: string })?.name ?? ""}`,
      `**Assignee:** ${(fields.assignee as { displayName: string } | null)?.displayName ?? "Unassigned"}`,
      `**Type:** ${(fields.issuetype as { name: string })?.name ?? ""}`,
      `**Labels:** ${(fields.labels as string[])?.join(", ") ?? ""}`,
    ].join("\n"),
  });

  const comments = (fields.comment as { comments: unknown[] } | undefined)?.comments ?? [];
  const recentComments = comments.slice(-3);

  let commentsContent = "";
  if (recentComments.length > 0) {
    commentsContent = recentComments
      .map((c) => {
        const comment = c as Record<string, unknown>;
        return `**${(comment.author as { displayName: string })?.displayName ?? "Unknown"}** (${String(comment.created ?? "")}):\n${String(comment.body ?? "")}`;
      })
      .join("\n\n");
  }

  contextBlocks.push({
    id: "jira-workflow",
    title: "Jira Workflow Instructions",
    priority: 50,
    content: [
      "You have access to Jira tools via the orchestrator:",
      "",
      "- `jira_add_comment(ticketKey, body)` — Add a comment to the Jira issue",
      "- `jira_transition_issue(ticketKey, status)` — Transition the issue to a new status",
      "",
      commentsContent.length > 0 ? `## Recent Comments\n\n${commentsContent}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return contextBlocks;
}
