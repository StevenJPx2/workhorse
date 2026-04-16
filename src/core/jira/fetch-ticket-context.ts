/**
 * Fetch Jira ticket context for agent resume
 *
 * Gets the current state of a Jira ticket including status, comments, and assignee.
 * Uses the Atlassian MCP client which handles authentication.
 */

import type { JiraClient } from "./types.ts";

/**
 * Jira comment
 */
export interface JiraComment {
  id: string;
  author: string;
  body: string;
  created: string;
  updated: string;
}

/**
 * Complete Jira ticket context for resume
 */
export interface JiraTicketContext {
  /** Issue key */
  key: string;
  /** Issue summary/title */
  summary: string;
  /** Issue description */
  description: string | null;
  /** Current status */
  status: string;
  /** Priority */
  priority: string | null;
  /** Assignee */
  assignee: string | null;
  /** Issue type */
  issueType: string;
  /** Full URL */
  url: string;
  /** Last updated timestamp */
  updated: string;
  /** Recent comments (fetched separately if supported) */
  recentComments?: JiraComment[];
  /** Timestamp when fetched */
  fetchedAt: string;
}

/**
 * Fetch Jira ticket context using the Atlassian MCP client
 *
 * @param client - Connected Jira client
 * @param ticketKey - Jira ticket key (e.g., "AM-123")
 * @returns Ticket context or null if fetch failed
 */
export async function fetchJiraTicketContext(
  client: JiraClient,
  ticketKey: string,
): Promise<JiraTicketContext | null> {
  try {
    const issue = await client.fetchIssue(ticketKey);

    return {
      key: issue.key,
      summary: issue.summary,
      description: issue.description,
      status: issue.status,
      priority: issue.priority,
      assignee: issue.assignee,
      issueType: issue.issueType,
      url: issue.url,
      updated: issue.updated,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[jira] Failed to fetch ticket context: ${error}`);
    return null;
  }
}

/**
 * Format Jira ticket context as a summary for the agent
 */
export function formatJiraContextSummary(ctx: JiraTicketContext): string {
  const lines: string[] = [];

  lines.push(`## Jira: ${ctx.key}`);
  lines.push("");
  lines.push(`**Summary:** ${ctx.summary}`);
  lines.push(`**Status:** ${ctx.status}`);

  if (ctx.priority) {
    lines.push(`**Priority:** ${ctx.priority}`);
  }

  if (ctx.assignee) {
    lines.push(`**Assignee:** ${ctx.assignee}`);
  }

  lines.push(`**Type:** ${ctx.issueType}`);
  lines.push(`**Last Updated:** ${ctx.updated}`);
  lines.push(`**URL:** ${ctx.url}`);

  if (ctx.description) {
    lines.push("");
    lines.push("### Description");
    // Truncate long descriptions
    const desc =
      ctx.description.length > 500 ? ctx.description.slice(0, 500) + "..." : ctx.description;
    lines.push(desc);
  }

  if (ctx.recentComments && ctx.recentComments.length > 0) {
    lines.push("");
    lines.push("### Recent Comments");

    for (const comment of ctx.recentComments.slice(-3)) {
      lines.push(`- **${comment.author}** (${comment.created}):`);
      const body = comment.body.length > 200 ? comment.body.slice(0, 200) + "..." : comment.body;
      lines.push(`  > ${body.replace(/\n/g, "\n  > ")}`);
    }
  }

  return lines.join("\n");
}
