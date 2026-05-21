/**
 * Jira agent lifecycle hooks — starts/stops monitors when agents are created.
 *
 * @module workhorse-plugin-jira/agent-hooks
 */
import type { WorkhorseContext } from "workhorse-core";

/** Register agent lifecycle hooks for Jira integration */
export function registerAgentHooks(ctx: WorkhorseContext): void {
  // Start comment monitor when agent is created for a Jira issue
  ctx.hooks.on("agent.create.post", async ({ adapter }) => {
    const issue = await ctx.db.issues.getByExternalId(adapter.issueId, "jira");
    if (issue) {
      ctx.monitors.startMonitor("jira-comments", issue.id);
    }
  });
}
