/**
 * Jira plugin steering rules.
 *
 * Provides idle-agent reminders for Jira-specific workflows.
 */

import type { JiratownContext } from "@stevenjpx2/jiratown-core";

/**
 * Register Jira-specific steering rules.
 */
export function registerJiraSteering(ctx: JiratownContext): void {
  // Remind to update Jira after implementation
  ctx.orchestrator.registerSteeringRule({
    id: "jira:update-after-implementation",
    name: "Update Jira after implementation",
    description: "Remind to add a comment or transition Jira after implementing",
    condition: {
      source: "jira",
      status: "implementing",
      when: (steerCtx) => {
        const editTools = ["edit", "write", "create_file"];
        const lastEditIdx = steerCtx.toolHistory.findLastIndex((t: { name: string }) =>
          editTools.includes(t.name),
        );
        if (lastEditIdx === -1) return false; // No edits at all
        // Fire if no Jira calls after the last edit
        return !steerCtx.toolHistory
          .slice(lastEditIdx + 1)
          .some((t: { name: string }) => t.name.startsWith("jira_"));
      },
    },
    reminder: `You've made code changes. Consider:
- Adding a progress comment to the Jira ticket with \`jira_add_comment\`
- If the fix is complete, transition the ticket with \`jira_transition_issue\``,
    priority: 10,
  });

  // Remind to transition after PR is merged
  ctx.orchestrator.registerSteeringRule({
    id: "jira:transition-after-merge",
    name: "Transition Jira after PR merge",
    description: "Remind to transition the Jira ticket after PR is merged",
    condition: {
      source: "jira",
      status: "in_review",
      hook: "github:pr.merged",
    },
    reminder: `The PR has been merged! Transition the Jira ticket to "In QA" and assign to reporter with \`jira_transition_issue\`.`,
    priority: 20,
    once: true,
  });

  // Remind about review feedback
  ctx.orchestrator.registerSteeringRule({
    id: "jira:address-feedback",
    name: "Address review feedback",
    description: "Remind to address comments when there are unacknowledged notifications",
    condition: {
      source: "jira",
      when: (steerCtx) =>
        steerCtx.notifications.filter((n: { status: string }) => n.status !== "acknowledged")
          .length > 0,
    },
    reminder: (steerCtx) =>
      `You have ${steerCtx.notifications.filter((n: { status: string }) => n.status !== "acknowledged").length} unread notification(s). Check the notification inbox and address any feedback.`,
    priority: 5,
  });
}
