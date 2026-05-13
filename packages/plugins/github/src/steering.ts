/**
 * GitHub plugin steering rules.
 *
 * Provides idle-agent reminders for GitHub-specific workflows.
 */

import type { WorkhorseContext } from "workhorse-core";

/**
 * Register GitHub-specific steering rules.
 */
export function registerGitHubSteering(ctx: WorkhorseContext): void {
  // Remind to create PR after implementation
  ctx.orchestrator.registerSteeringRule({
    id: "github:create-pr",
    name: "Create PR after implementation",
    description: "Remind to create a PR when code is ready",
    condition: {
      status: "implementing",
      when: (steerCtx) => {
        return !steerCtx.toolHistory.some((t: { name: string }) => t.name === "github_open_pr");
      },
    },
    reminder: `You've made code changes but haven't created a PR yet. When ready:
1. Run tests to verify the fix
2. Create a PR with \`github_open_pr\``,
    priority: 15,
  });

  // Remind about CI failures
  ctx.orchestrator.registerSteeringRule({
    id: "github:fix-ci",
    name: "Fix CI failures",
    description: "Remind to fix CI when checks fail",
    condition: {
      status: "in_review",
      when: (steerCtx) =>
        steerCtx.notifications.some(
          (n: { source: string; title: string; status: string }) =>
            n.source === "github" &&
            n.title.startsWith("CI check failed") &&
            n.status !== "acknowledged",
        ),
    },
    reminder: (steerCtx) =>
      `CI checks are failing. Review the error and fix the issue:\n\n${
        steerCtx.notifications.find(
          (n: { source: string; title: string }) =>
            n.source === "github" && n.title.startsWith("CI check failed"),
        )?.body ?? "Check the PR for details."
      }`,
    priority: 25,
    once: true,
  });

  // Remind about review comments
  ctx.orchestrator.registerSteeringRule({
    id: "github:address-review",
    name: "Address PR review comments",
    description: "Remind to address review feedback",
    condition: {
      status: "in_review",
      when: (steerCtx) =>
        steerCtx.notifications.some(
          (n: { source: string; title: string; priority: string; status: string }) =>
            n.source === "github" &&
            n.title.startsWith("PR Review: changes requested") &&
            n.priority === "high" &&
            n.status !== "acknowledged",
        ),
    },
    reminder: `A reviewer has requested changes on your PR. Address the feedback and push updates.`,
    priority: 20,
  });

  // Remind to create PR if not in early stages and no PR exists yet
  // Checks issue.metadata.prNumber which is only set on successful PR creation
  ctx.orchestrator.registerSteeringRule({
    id: "github:missing-pr",
    name: "Create PR if missing",
    description: "Remind to create a PR when not planning/implementing and no PR exists",
    condition: {
      when: (steerCtx) => {
        const status = steerCtx.issue.status;
        // Early stages: still working on the code, PR not expected yet
        if (status === "planning" || status === "implementing") return false;

        // Check if a PR was actually created (metadata set by open-pr tool on success)
        const meta = steerCtx.issue.metadata as Record<string, unknown> | undefined;
        return !(meta?.prNumber != null || meta?.prUrl != null);
      },
    },
    reminder: `You're past the implementation phase but haven't created a PR yet. Create one with \`github_open_pr\` to submit your changes for review.`,
    priority: 18,
  });
}
