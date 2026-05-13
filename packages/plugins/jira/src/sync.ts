/**
 * Jira status sync — transitions Jira tickets when issue.status_changed fires.
 *
 * When status changes to "planning":
 * - Transitions the Jira ticket to "In Progress"
 * - Assigns the ticket to the current user (API token owner)
 *
 * @module workhorse-plugin-jira/sync
 */

import type { IssueStatus, WorkhorseContext } from "workhorse-core";
import type { AtlassianClient } from "./client.ts";

/** Register status sync hook */
export function registerStatusSync(ctx: WorkhorseContext, client: AtlassianClient): void {
  const statusMapping: Record<IssueStatus, string> = {
    pending: "To Do",
    queued: "To Do",
    planning: "In Progress",
    implementing: "In Progress",
    blocked: "Blocked",
    in_review: "In Review",
    done: "Done",
  };

  ctx.hooks.on("issue.status_changed", async ({ issue, from, to }) => {
    if (issue.source !== "jira") return;

    try {
      const transition = await client
        .getTransitions(issue.externalId)
        .then((r) =>
          r.find((t) => t.name.toLowerCase().includes((statusMapping[to] ?? to).toLowerCase())),
        );

      if (!transition) {
        console.warn(`[jira] No transition found for status "${to}" on ${issue.externalId}`);
        return;
      }

      await client.transitionIssue(issue.externalId, transition.id);
      console.log(`[jira] Transitioned ${issue.externalId} to "${transition.to.name}"`);
      ctx.hooks.emit("jira:issue.transitioned", {
        issueId: issue.externalId,
        from: statusMapping[from] ?? from,
        to: transition.to.name,
      });

      // When entering planning, also assign the ticket to the current user
      if (to === "planning") {
        const currentUser = await client.getCurrentUser();
        await client.editIssue(issue.externalId, {
          assignee: { accountId: currentUser.accountId },
        });
        console.log(`[jira] Assigned ${issue.externalId} to ${currentUser.displayName}`);
        ctx.hooks.emit("jira:issue.assigned", {
          issueId: issue.externalId,
          from: undefined,
          to: currentUser.accountId,
        });
      }
    } catch (error) {
      console.error(`[jira] Failed to sync status for ${issue.externalId}:`, error);
    }
  });
}
