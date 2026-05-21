/**
 * Unified GitHub PR monitor.
 *
 * Polls for all PR activity: reviews, comments, check status, mergeable state, and merge events.
 * Creates notifications with appropriate priorities.
 * Emits plugin hooks for cross-plugin coordination.
 *
 * @module workhorse-plugin-github/monitor
 */
import {
  type Database,
  type PollingMonitorOptions,
  isWorkhorseGenerated,
} from "workhorse-core";

import type { GitHubClient } from "../client.ts";
import "../hooks.ts";
import type { GitHubPRMonitorState } from "../types.ts";
import { processCheckChanges } from "./checks";
import {
  emitCheckHooks,
  emitCloseHook,
  emitMergeHook,
  emitReviewHooks,
} from "./hooks-emitter";
import {
  createCommentNotifications,
  createMergeableNotification,
  createMergedNotification,
  createReviewNotifications,
} from "./notifications";

const MONITOR_STATE_KEY = "github_pr_monitor_state";

/** Create monitor options for the unified GitHub PR monitor */
export function createGitHubPRMonitor(
  client: GitHubClient,
  interval: number,
  db: Database,
): PollingMonitorOptions {
  return {
    id: "github-pr",
    type: "polling",
    interval,
    poll: async (ctx) => {
      const issue = await db.issues.getById(ctx.issueId);
      if (!issue) return { hasChanges: false };

      const metadata = (issue.metadata ?? {}) as Record<string, unknown>;
      const owner = metadata.owner as string | undefined;
      const repo = metadata.repo as string | undefined;
      const prNumber = metadata.prNumber as number | undefined;
      if (!owner || !repo || !prNumber) return { hasChanges: false };

      const state: GitHubPRMonitorState = (metadata[
        MONITOR_STATE_KEY
      ] as GitHubPRMonitorState) ?? {
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

      const pr = await client.fetchPR(owner, repo, prNumber);
      const headSha = pr.head?.sha;

      const [reviews, comments, checkRuns] = await Promise.all([
        client.getPRReviews(owner, repo, prNumber),
        client.getPRComments(owner, repo, prNumber),
        headSha
          ? client.getCheckRuns(owner, repo, headSha)
          : Promise.resolve([]),
      ]);

      // Process new reviews
      const newReviews = reviews.filter(
        (r) => !state.lastSeenReviewIds.includes(r.id),
      );
      if (newReviews.length > 0) {
        hasChanges = true;
        changes.newReviews = newReviews.length;
        await createReviewNotifications(ctx, newReviews, meta);
        emitReviewHooks(ctx, issue, newReviews);
      }

      // Process new comments (filter out bot-generated)
      const newComments = comments.filter(
        (c) =>
          !state.lastSeenCommentIds.includes(c.id) &&
          !isWorkhorseGenerated(c.body),
      );
      if (newComments.length > 0) {
        hasChanges = true;
        changes.newComments = newComments.length;
        await createCommentNotifications(ctx, newComments, meta);
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
        emitCheckHooks(ctx, issue, prNumber, checkRuns, checkChanges.summary);
      }

      // Process mergeable state changes
      if (
        state.lastMergeableState &&
        pr.mergeable_state !== state.lastMergeableState
      ) {
        hasChanges = true;
        changes.mergeableStateChanged = {
          from: state.lastMergeableState,
          to: pr.mergeable_state,
        };
        createMergeableNotification(ctx, pr.mergeable_state, meta);
      }

      // Detect PR merge
      if (pr.merged && !state.lastMerged) {
        hasChanges = true;
        changes.merged = true;
        createMergedNotification(ctx, pr.merged_by?.login, meta);
        emitMergeHook(ctx, issue, prNumber, pr);
      }

      // Detect PR closed without merge
      const isClosed = pr.state === "closed" && !pr.merged;
      if (isClosed && !state.lastClosed) {
        hasChanges = true;
        changes.closed = true;
        emitCloseHook(ctx, issue, prNumber, pr.html_url);
      }

      // Update state
      await db.issues.update(issue.id, {
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
