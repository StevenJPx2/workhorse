/**
 * Jira status sync — emits transition/assignment requests when issue.status_changed fires.
 *
 * Maps internal Workhorse statuses to Jira statuses and emits request hooks.
 * The actual API calls are handled by hook-consumers.ts.
 *
 * When status changes to "planning":
 * - Requests transition to "In Progress"
 * - Requests assignment to current user
 *
 * @module workhorse-plugin-jira/sync
 */
import type { IssueStatus, WorkhorseContext } from "workhorse-core";

/** Mapping from internal Workhorse status to Jira status name */
const STATUS_MAPPING: Record<IssueStatus, string> = {
  pending: "To Do",
  queued: "To Do",
  planning: "In Progress",
  implementing: "In Progress",
  blocked: "Blocked",
  in_review: "In Review",
  done: "Done",
};

/** Register status sync hook — emits jira:transition.requested and jira:assign.requested */
export function registerStatusSync(ctx: WorkhorseContext): void {
  ctx.hooks.on("issue.status_changed", ({ issue, from, to }) => {
    if (issue.source !== "jira") return;

    // Request transition to the mapped Jira status
    ctx.hooks.emit("jira:transition.requested", {
      issueId: issue.externalId,
      targetStatus: STATUS_MAPPING[to] ?? to,
      fromStatus: STATUS_MAPPING[from] ?? from,
    });

    // When entering planning, also request assignment to current user
    if (to === "planning") {
      ctx.hooks.emit("jira:assign.requested", {
        issueId: issue.externalId,
        assignee: "self",
      });
    }
  });
}
