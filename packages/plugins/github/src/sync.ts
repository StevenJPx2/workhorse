/**
 * GitHub status sync — updates PR labels when issue.status_changed fires.
 *
 * @module @stevenjpx2/jiratown-plugin-github/sync
 */

import type { IssueStatus, WorkhorseContext } from "workhorse-core";
import type { GitHubClient } from "./client.ts";

/** Status to label mapping */
const STATUS_LABELS: Partial<Record<IssueStatus, { add?: string; remove?: string[] }>> = {
  blocked: {
    add: "blocked",
    remove: ["ready-for-review"],
  },
  in_review: {
    add: "ready-for-review",
    remove: ["blocked", "work-in-progress"],
  },
  done: {
    remove: ["blocked", "work-in-progress", "ready-for-review", "in-review"],
  },
};

/** Register status sync hook */
export function registerStatusSync(ctx: WorkhorseContext, client: GitHubClient): void {
  ctx.hooks.on("issue.status_changed", async ({ issue, to }) => {
    if (issue.source !== "github") return;

    const metadata = (issue.metadata ?? {}) as Record<string, unknown>;
    const owner = metadata.owner as string | undefined;
    const repo = metadata.repo as string | undefined;
    const prNumber = metadata.prNumber as number | undefined;

    // Only sync if we have a PR
    if (!owner || !repo || !prNumber) return;

    const labelConfig = STATUS_LABELS[to];
    if (!labelConfig) return;

    try {
      // Add new label if specified
      if (labelConfig.add) {
        await client.addLabel(owner, repo, prNumber, labelConfig.add);
        console.log(`[github] Added label "${labelConfig.add}" to ${owner}/${repo}#${prNumber}`);
      }

      // Remove old labels if specified
      if (labelConfig.remove) {
        for (const label of labelConfig.remove) {
          await client.removeLabel(owner, repo, prNumber, label);
        }
        console.log(
          `[github] Removed labels [${labelConfig.remove.join(", ")}] from ${owner}/${repo}#${prNumber}`,
        );
      }
    } catch (error) {
      console.error(`[github] Failed to sync labels for ${owner}/${repo}#${prNumber}:`, error);
    }
  });
}
