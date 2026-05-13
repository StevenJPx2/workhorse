/**
 * Jira prompt enrichment for the PromptEngineer.
 *
 * Hooks `prompt.building` to add Jira state and workflow context blocks.
 *
 * @module workhorse-plugin-jira/prompt
 */

import type { WorkhorseContext, PromptContextBlock } from "workhorse-core";
import type { AtlassianClient } from "./client.ts";

/** Register prompt enrichment hooks */
export function registerPromptHooks(ctx: WorkhorseContext, client: AtlassianClient): void {
  // Hook receives PromptBuildingContext directly (issueId is internal UUID)
  ctx.hooks.on("prompt.building", async (buildingCtx) => {
    const issue = await ctx.db.issues.getById(buildingCtx.issueId);
    if (!issue || issue.source !== "jira") return;

    try {
      buildingCtx.contextBlocks.push(
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

  // Add recent comments if any
  if (commentsContent.length > 0) {
    contextBlocks.push({
      id: "jira-comments",
      title: "Recent Jira Comments",
      priority: 15,
      content: commentsContent,
    });
  }

  contextBlocks.push({
    id: "jira-workflow",
    title: "Jira Workflow",
    priority: 50,
    content: [
      "Use `jira_*` tools to communicate progress:",
      "- Add comments for status updates or questions",
      "- Transition issue status when implementation phases complete",
      "- Check notifications for team feedback",
    ].join("\n"),
  });

  return contextBlocks;
}
