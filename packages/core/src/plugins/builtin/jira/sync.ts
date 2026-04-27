/**
 * Jira status sync — transitions Jira tickets when issue.status_changed fires.
 *
 * @module plugins/builtin/jira/sync
 */

import type { IssueStatus } from "#db";
import type { JiratownContext } from "#context";
import type { AtlassianClient } from "./client.ts";

/** Register status sync hook */
export function registerStatusSync(ctx: JiratownContext, client: AtlassianClient): void {
  const statusMapping: Record<IssueStatus, string> = {
    pending: "To Do",
    queued: "To Do",
    planning: "In Progress",
    implementing: "In Progress",
    blocked: "Blocked",
    pr_created: "In Review",
    in_review: "In Review",
    done: "Done",
  };

  ctx.hooks.on("issue.status_changed", async ({ issue, to }) => {
    if (issue.source !== "jira") return;

    try {
      const transition = (await client.getTransitions(issue.externalId)).find((t) =>
        t.name.toLowerCase().includes((statusMapping[to] ?? to).toLowerCase()),
      );

      if (!transition) {
        console.warn(`[jira] No transition found for status "${to}" on ${issue.externalId}`);
        return;
      }

      await client.transitionIssue(issue.externalId, transition.id);
      console.log(`[jira] Transitioned ${issue.externalId} to "${transition.to.name}"`);
    } catch (error) {
      console.error(`[jira] Failed to sync status for ${issue.externalId}:`, error);
    }
  });
}
