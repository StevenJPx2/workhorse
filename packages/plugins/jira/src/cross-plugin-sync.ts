/**
 * Cross-Plugin Sync — Jira reactions to GitHub plugin events.
 *
 * Listens for GitHub plugin hooks and performs corresponding Jira actions.
 * This enables automated workflow transitions based on GitHub activity.
 *
 * Example: When a GitHub PR is merged, transition the Jira issue to "In QA"
 * and assign it to the reporter for verification.
 *
 * @module @jiratown/plugin-jira/cross-plugin-sync
 */

import type { Database, JiratownContext } from "@jiratown/core";
import type { AtlassianClient } from "./client.ts";
// Import Jira hooks for emitting
import "./hooks.ts";
import { registerPRContribution } from "./pr-contribution.ts";

/** Payload type for github:pr.merged event (mirrors GitHubPluginHooks) */
interface PRMergedPayload {
  issueId: string;
  externalId: string;
  source: string;
  pr: {
    number: number;
    url: string;
    mergedBy?: string;
    mergedAt: string;
  };
}

/**
 * Register cross-plugin sync handlers.
 *
 * Sets up listeners for GitHub plugin events and performs corresponding
 * Jira actions for workflow automation.
 */
export function registerCrossPluginSync(
  ctx: JiratownContext,
  client: AtlassianClient,
  db: Database,
): void {
  // Register PR contribution handler (Related Tickets section)
  registerPRContribution(ctx, client, db);

  // Listen for GitHub PR merged events
  // Note: Using type assertion because HookEventMap uses Record<string, unknown> for custom hooks
  ctx.hooks.on("github:pr.merged", async (event: unknown) => {
    const { issueId, source, pr } = event as PRMergedPayload;

    // Only process issues that originated from Jira
    if (source !== "jira") {
      return;
    }

    // Find the issue by its internal ID
    const issue = await db.issues.getById(issueId);
    if (!issue) {
      // Issue not found, skip
      return;
    }

    // The externalId for Jira issues is the ticket key (e.g., "PROJ-123")
    const ticketKey = issue.externalId;

    try {
      // Fetch the full Jira issue to get reporter info
      const jiraIssue = await client.fetchIssue(ticketKey);
      const reporterAccountId = jiraIssue.fields.reporter?.accountId;

      // Get available transitions and find "In QA" or similar
      const qaTransition = findQATransition(await client.getTransitions(ticketKey));

      // Transition to QA status if available
      if (qaTransition) {
        await client.transitionIssue(ticketKey, qaTransition.id);
      }

      // Assign to reporter for QA verification
      if (reporterAccountId) {
        await client.editIssue(ticketKey, {
          assignee: { accountId: reporterAccountId },
        });
      }

      await client.addComment(
        ticketKey,
        `✅ PR #${pr.number} has been merged.\n\n${
          reporterAccountId
            ? "Assigned to reporter for QA verification."
            : "Ready for QA verification."
        }\n\nMerged by: ${pr.mergedBy ?? "unknown"}\nPR URL: ${pr.url}`,
      );

      // Emit hook for other listeners
      ctx.hooks.emit("jira:issue.transitioned", {
        issueId: ticketKey,
        from: jiraIssue.fields.status.name,
        to: qaTransition?.to.name ?? jiraIssue.fields.status.name,
      });

      if (reporterAccountId) {
        ctx.hooks.emit("jira:issue.assigned", {
          issueId: ticketKey,
          from: jiraIssue.fields.assignee?.accountId,
          to: reporterAccountId,
        });
      }
    } catch (error) {
      // Log error but don't crash - cross-plugin sync is best-effort
      console.error(`[jira] Cross-plugin sync failed for ${ticketKey}:`, error);
    }
  });
}

/**
 * Find a transition that leads to a QA/Review/Testing status.
 *
 * Checks for common naming patterns across different Jira workflows.
 */
function findQATransition(
  transitions: Array<{ id: string; name: string; to: { name: string; id: string } }>,
): { id: string; name: string; to: { name: string; id: string } } | undefined {
  // Common QA-related status names (case-insensitive)
  const qaPatterns = [
    /\bqa\b/i,
    /\bquality\s*assurance\b/i,
    /\breview\b/i,
    /\btesting\b/i,
    /\bverify\b/i,
    /\bvalidate\b/i,
    /\bready\s*for\s*qa\b/i,
    /\bin\s*qa\b/i,
    /\buser\s*acceptance\b/i,
    /\buat\b/i,
  ];

  // First try to match the target status name (to.name)
  for (const pattern of qaPatterns) {
    const match = transitions.find((t) => pattern.test(t.to.name));
    if (match) return match;
  }

  // Then try to match the transition name itself
  for (const pattern of qaPatterns) {
    const match = transitions.find((t) => pattern.test(t.name));
    if (match) return match;
  }

  return undefined;
}
