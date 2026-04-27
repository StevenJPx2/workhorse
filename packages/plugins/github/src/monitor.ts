/**
 * Unified GitHub PR monitor.
 *
 * Polls for all PR activity: reviews, comments, check status, and mergeable state.
 * Creates notifications with appropriate priorities.
 *
 * @module @jiratown/plugin-github/monitor
 */

import type { Database, MonitorOptions } from "@jiratown/core";
import type { GitHubClient } from "./client.ts";
import { processCheckChanges } from "./monitor-checks";
import {
  createCommentNotifications,
  createMergeableNotification,
  createReviewNotifications,
} from "./monitor-notifications";
import type { GitHubPRMonitorState } from "./types.ts";

/** Metadata key for storing monitor state */
const MONITOR_STATE_KEY = "github_pr_monitor_state";

/** Create monitor options for the unified GitHub PR monitor */
export function createGitHubPRMonitor(
  client: GitHubClient,
  interval: number,
  db: Database,
): MonitorOptions {
  return {
    id: "github-pr",
    type: "remote",
    interval,
    poll: async (ctx) => {
      const issue = db.issues.getById(ctx.issueId);
      if (!issue || issue.source !== "github") {
        return { hasChanges: false };
      }

      // Need PR metadata to poll
      const metadata = (issue.metadata ?? {}) as Record<string, unknown>;
      const owner = metadata.owner as string | undefined;
      const repo = metadata.repo as string | undefined;
      const prNumber = issue.prNumber;

      if (!owner || !repo || !prNumber) {
        return { hasChanges: false };
      }

      // Get current state from metadata
      const state: GitHubPRMonitorState = (metadata[MONITOR_STATE_KEY] as GitHubPRMonitorState) ?? {
        lastSeenReviewIds: [],
        lastSeenCommentIds: [],
        lastCheckConclusions: {},
        lastMergeableState: "",
      };

      let hasChanges = false;
      const changes: Record<string, unknown> = {};
      const meta = { prNumber, owner, repo };

      // Fetch PR data
      const [pr, reviews, comments, checkRuns] = await Promise.all([
        client.fetchPR(owner, repo, prNumber),
        client.getPRReviews(owner, repo, prNumber),
        client.getPRComments(owner, repo, prNumber),
        client.getCheckRuns(owner, repo, issue.prUrl?.match(/\/([a-f0-9]+)$/)?.[1] ?? "HEAD"),
      ]);

      // Process new reviews
      const newReviews = reviews.filter((r) => !state.lastSeenReviewIds.includes(r.id));
      if (newReviews.length > 0) {
        hasChanges = true;
        changes.newReviews = newReviews.length;
        createReviewNotifications(ctx, newReviews, meta);
      }

      // Process new comments
      const newComments = comments.filter((c) => !state.lastSeenCommentIds.includes(c.id));
      if (newComments.length > 0) {
        hasChanges = true;
        changes.newComments = newComments.length;
        createCommentNotifications(ctx, newComments, meta);
      }

      // Process check status changes
      const checkChanges = processCheckChanges(
        checkRuns,
        state.lastCheckConclusions,
        ctx.memory.notifications,
        {
          issueId: ctx.issueId,
          ...meta,
        },
      );
      if (checkChanges.hasChanges) {
        hasChanges = true;
        changes.checkChanges = checkChanges.summary;
      }

      // Process mergeable state changes
      if (state.lastMergeableState && pr.mergeable_state !== state.lastMergeableState) {
        hasChanges = true;
        changes.mergeableStateChanged = { from: state.lastMergeableState, to: pr.mergeable_state };
        createMergeableNotification(ctx, pr.mergeable_state, meta);
      }

      // Update state
      db.issues.update(issue.id, {
        metadata: {
          ...metadata,
          [MONITOR_STATE_KEY]: {
            lastSeenReviewIds: reviews.map((r) => r.id),
            lastSeenCommentIds: comments.map((c) => c.id),
            lastCheckConclusions: Object.fromEntries(
              checkRuns.map((c) => [c.name, c.conclusion ?? ""]),
            ),
            lastMergeableState: pr.mergeable_state,
          } satisfies GitHubPRMonitorState,
        },
      });

      return { hasChanges, data: hasChanges ? changes : undefined };
    },
  };
}
