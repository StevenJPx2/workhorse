/**
 * Jira hook consumers — handles transition and assignment requests.
 *
 * Listens to:
 * - `jira:transition.requested` — transitions the Jira ticket
 * - `jira:assign.requested` — assigns the Jira ticket
 *
 * Emits on success:
 * - `jira:issue.transitioned`
 * - `jira:issue.assigned`
 *
 * @module workhorse-plugin-jira/hook-consumers
 */

import type { WorkhorseContext } from "workhorse-core";

import type { AtlassianClient } from "./client.ts";
import type { JiraPluginHooks } from "./hooks.ts";

/** Register consumers for Jira action hooks */
export function registerHookConsumers(
  ctx: WorkhorseContext,
  client: AtlassianClient,
): void {
  // Handle transition requests
  ctx.hooks.on("jira:transition.requested", async (event: unknown) => {
    const { issueId, targetStatus, fromStatus } =
      event as JiraPluginHooks["jira:transition.requested"];

    try {
      const transition = await client
        .getTransitions(issueId)
        .then((transitions) =>
          transitions.find((t) =>
            t.to.name.toLowerCase().includes(targetStatus.toLowerCase()),
          ),
        );

      if (!transition) {
        console.warn(
          `[jira] No transition to "${targetStatus}" found for ${issueId}`,
        );
        return;
      }

      await client.transitionIssue(issueId, transition.id);
      console.log(`[jira] Transitioned ${issueId} to "${transition.to.name}"`);

      ctx.hooks.emit("jira:issue.transitioned", {
        issueId,
        from: fromStatus ?? "unknown",
        to: transition.to.name,
      });
    } catch (error) {
      console.error(`[jira] Failed to transition ${issueId}:`, error);
    }
  });

  // Handle assignment requests
  ctx.hooks.on("jira:assign.requested", async (event: unknown) => {
    const { issueId, assignee } =
      event as JiraPluginHooks["jira:assign.requested"];

    try {
      let accountId: string;
      let displayName: string;

      if (assignee === "self") {
        const currentUser = await client.getCurrentUser();
        accountId = currentUser.accountId;
        displayName = currentUser.displayName;
      } else {
        accountId = assignee;
        displayName = assignee; // We don't have the display name for arbitrary accountIds
      }

      await client.editIssue(issueId, { assignee: { accountId } });
      console.log(`[jira] Assigned ${issueId} to ${displayName}`);

      ctx.hooks.emit("jira:issue.assigned", {
        issueId,
        from: undefined,
        to: accountId,
      });
    } catch (error) {
      console.error(`[jira] Failed to assign ${issueId}:`, error);
    }
  });
}
