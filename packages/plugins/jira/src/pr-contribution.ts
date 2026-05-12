/**
 * Jira PR Contribution — Adds Related Tickets section to GitHub PRs.
 *
 * Listens to `github:pr.opening` and adds a table of related Jira tickets.
 *
 * @module @stevenjpx2/jiratown-plugin-jira/pr-contribution
 */

import type { Database, WorkhorseContext } from "workhorse-core";
import type { AtlassianClient } from "./client.ts";

/** Payload type for github:pr.opening event (mirrors PROpeningContext) */
interface PROpeningPayload {
  issueId: string;
  title: string;
  body: string;
  base: string;
  head: string;
  draft: boolean;
  worktreePath: string;
  contributions: Array<{
    section: string;
    content: string;
    priority?: number;
  }>;
}

/**
 * Register PR contribution handler.
 * Adds "Related Tickets" section to PRs with linked Jira issues.
 */
export function registerPRContribution(
  ctx: WorkhorseContext,
  client: AtlassianClient,
  db: Database,
): void {
  ctx.hooks.on("github:pr.opening", async (event: unknown) => {
    const openingCtx = event as PROpeningPayload;

    // Find the issue to get Jira ticket info
    const issue = await db.issues.getById(openingCtx.issueId);
    if (!issue || issue.source !== "jira") {
      return;
    }

    // Get the Jira ticket key (externalId)
    const ticketKey = issue.externalId;

    try {
      // Fetch Jira issue to get full details
      const jiraIssue = await client.fetchIssue(ticketKey);

      openingCtx.contributions.push({
        section: "Related Tickets",
        content: [
          `| Ticket | Summary | Status |`,
          `| --- | --- | --- |`,
          `| [${ticketKey}](https://${jiraIssue.self.match(/https:\/\/([^.]+)\.atlassian\.net/)?.[1] ?? ""}.atlassian.net/browse/${ticketKey}) | ${jiraIssue.fields.summary} | ${jiraIssue.fields.status.name} |`,
        ].join("\n"),
        priority: 10, // Show early in the PR
      });
    } catch (error) {
      // Best effort - don't fail PR creation if Jira lookup fails
      console.error(`[jira] Failed to add Related Tickets to PR for ${ticketKey}:`, error);
    }
  });
}
