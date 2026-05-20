/**
 * Jira prompt enrichment for the PromptEngineer.
 *
 * Hooks `prompt.building` to add Jira state and workflow context blocks.
 *
 * @module workhorse-plugin-jira/prompt
 */

import type { WorkhorseContext, PromptContextBlock } from "workhorse-core";
import type { AtlassianClient } from "./client.ts";
import { extractMediaRefsFromAdf } from "./attachments.ts";

/** Register prompt enrichment hooks */
export function registerPromptHooks(ctx: WorkhorseContext, client: AtlassianClient): void {
  // Hook receives PromptBuildingContext directly (issueId is internal UUID)
  ctx.hooks.on("prompt.building", async (buildingCtx) => {
    const issue = await ctx.db.issues.getById(buildingCtx.issueId);
    if (!issue || issue.source !== "jira") return;

    try {
      // Fetch with attachments to show attachment info in prompt
      buildingCtx.contextBlocks.push(
        ...buildJiraContextBlocks(await client.fetchIssueWithAttachments(issue.externalId)),
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

  // Build attachment summary with filenames
  const attachments = (fields.attachment as { filename: string; mimeType: string }[]) ?? [];
  const imageCount = attachments.filter((a) => a.mimeType?.startsWith("image/")).length;
  let attachmentSummary = "None";
  if (attachments.length > 0) {
    attachmentSummary = `${attachments.length} (${imageCount} images, ${attachments.length - imageCount} other): ${attachments.map((a) => a.filename).join(", ")}`;
  }

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
      `**Attachments:** ${attachmentSummary}`,
    ].join("\n"),
  });

  // Process comments - extract text from ADF and detect embedded media
  const comments = (fields.comment as { comments: unknown[] } | undefined)?.comments ?? [];
  const recentComments = comments.slice(-3);
  let totalCommentMedia = 0;

  let commentsContent = "";
  if (recentComments.length > 0) {
    commentsContent = recentComments
      .map((c) => {
        const comment = c as Record<string, unknown>;
        const mediaRefs = extractMediaRefsFromAdf(comment.body);
        totalCommentMedia += mediaRefs.length;

        return `**${(comment.author as { displayName: string })?.displayName ?? "Unknown"}** (${String(comment.created ?? "")}):${mediaRefs.length > 0 ? ` [📎 ${mediaRefs.length} embedded media]` : ""}\n${extractTextFromAdf(comment.body)}`;
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

  // Build workflow instructions (include attachment hint if there are attachments or comment media)
  const workflowLines = [
    "Use `jira_*` tools to communicate progress:",
    "- Add comments for status updates or questions",
    "- Transition issue status when implementation phases complete",
    "- Check notifications for team feedback",
  ];
  if (attachments.length > 0 || totalCommentMedia > 0) {
    const parts: string[] = [];
    if (attachments.length > 0) parts.push(`${attachments.length} issue attachment(s)`);
    if (totalCommentMedia > 0) parts.push(`${totalCommentMedia} embedded in comments`);
    workflowLines.push(
      `- Use \`jira_get_attachments\` to download and view media (${parts.join(", ")})`,
    );
  }

  contextBlocks.push({
    id: "jira-workflow",
    title: "Jira Workflow",
    priority: 50,
    content: workflowLines.join("\n"),
  });

  return contextBlocks;
}

/** Extract plain text from Atlassian Document Format (ADF) content */
function extractTextFromAdf(adf: unknown): string {
  if (typeof adf === "string") return adf;
  if (adf === null || adf === undefined) return "";

  if (typeof adf === "object" && adf !== null) {
    const obj = adf as Record<string, unknown>;
    if (Array.isArray(obj.content)) {
      return extractTextNodes(obj.content);
    }
  }

  return String(adf);
}

/** Recursively extract text from ADF content nodes */
// oxlint-disable-next-line workhorse/no-single-reference-function -- recursive function
function extractTextNodes(nodes: unknown[]): string {
  const parts: string[] = [];

  for (const node of nodes) {
    if (typeof node !== "object" || node === null) continue;
    const n = node as Record<string, unknown>;

    if (typeof n.text === "string") {
      parts.push(n.text);
    } else if (Array.isArray(n.content)) {
      parts.push(extractTextNodes(n.content));
    }
  }

  return parts.join("\n");
}
