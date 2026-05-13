/**
 * Unified GitHub PR monitor.
 *
 * Polls for all PR activity: reviews, comments, check status, mergeable state, and merge events.
 * Creates notifications with appropriate priorities.
 * Emits plugin hooks for cross-plugin coordination.
 *
 * @module workhorse-plugin-github/monitor
 */

import type { Database, MonitorOptions } from "workhorse-core";
import type { GitHubClient } from "./client.ts";
// Import hooks types to enable module augmentation
import "./hooks.ts";
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
      // Note: ctx.issueId is the externalId, not the internal UUID
      const issue = await db.issues.getByExternalId(ctx.issueId);
      if (!issue) {
        return { hasChanges: false };
      }

      // Need PR metadata to poll
      const metadata = (issue.metadata ?? {}) as Record<string, unknown>;
      const owner = metadata.owner as string | undefined;
      const repo = metadata.repo as string | undefined;
      const prNumber = metadata.prNumber as number | undefined;

      if (!owner || !repo || !prNumber) {
        return { hasChanges: false };
      }

      // Get current state from metadata
      const state: GitHubPRMonitorState = (metadata[MONITOR_STATE_KEY] as GitHubPRMonitorState) ?? {
        lastSeenReviewIds: [],
        lastSeenCommentIds: [],
        lastCheckConclusions: {},
        lastMergeableState: "",
        lastMerged: false,
        lastClosed: false,
      };

      let hasChanges = false;
      const changes: Record<string, unknown> = {};
      const meta = { prNumber, owner, repo };

      // Fetch PR data
      const [pr, reviews, comments, checkRuns] = await Promise.all([
        client.fetchPR(owner, repo, prNumber),
        client.getPRReviews(owner, repo, prNumber),
        client.getPRComments(owner, repo, prNumber),
        client.getCheckRuns(
          owner,
          repo,
          (metadata.prUrl as string | undefined)?.match(/\/([a-f0-9]+)$/)?.[1] ?? "HEAD",
        ),
      ]);

      // Process new reviews
      const newReviews = reviews.filter((r) => !state.lastSeenReviewIds.includes(r.id));
      if (newReviews.length > 0) {
        hasChanges = true;
        changes.newReviews = newReviews.length;
        createReviewNotifications(ctx, newReviews, meta);
        newReviews.forEach((review) => {
          ctx.hooks.emit("github:review.submitted", {
            issueId: issue.id,
            review: {
              state: review.state as "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED",
              author: review.user?.login ?? "unknown",
              body: review.body ?? "",
            },
          });
        });
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
        { issueId: ctx.issueId, ...meta },
      );
      if (checkChanges.hasChanges) {
        hasChanges = true;
        changes.checkChanges = checkChanges.summary;
        if (checkChanges.summary.failed) {
          ctx.hooks.emit("github:checks.failed", {
            issueId: issue.id,
            pr: { number: prNumber },
            failedChecks: checkRuns
              .filter((c) => c.conclusion === "failure")
              .map((c) => ({
                name: c.name,
                url: c.html_url ?? "",
              })),
          });
        }
        if (checkChanges.summary.allPassing) {
          ctx.hooks.emit("github:checks.passed", { issueId: issue.id, pr: { number: prNumber } });
        }
      }

      // Process mergeable state changes
      if (state.lastMergeableState && pr.mergeable_state !== state.lastMergeableState) {
        hasChanges = true;
        changes.mergeableStateChanged = { from: state.lastMergeableState, to: pr.mergeable_state };
        createMergeableNotification(ctx, pr.mergeable_state, meta);
      }

      const emitMergeHook = () => {
        ctx.hooks.emit("github:pr.merged", {
          issueId: issue.id,
          externalId: issue.externalId,
          source: issue.source,
          pr: {
            number: prNumber,
            url: pr.html_url,
            mergedBy: pr.merged_by?.login,
            mergedAt: pr.merged_at ?? new Date().toISOString(),
          },
        });
      };

      const emitCloseHook = (isClosed: boolean) => {
        if (!isClosed) return;
        ctx.hooks.emit("github:pr.closed", {
          issueId: issue.id,
          pr: { number: prNumber, url: pr.html_url },
        });
      };

      // Detect PR merge and emit plugin hook for cross-plugin coordination
      if (pr.merged && !state.lastMerged) {
        hasChanges = true;
        changes.merged = true;
        emitMergeHook();
      }

      // Detect PR closed without merge
      const isClosed = pr.state === "closed" && !pr.merged;
      if (isClosed && !state.lastClosed) {
        hasChanges = true;
        changes.closed = true;
        emitCloseHook(isClosed);
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
            lastMerged: pr.merged,
            lastClosed: isClosed,
          } satisfies GitHubPRMonitorState,
        },
      });

      return { hasChanges, data: hasChanges ? changes : undefined };
    },
  };
}
