/**
 * Notification helpers for GitHub PR monitor.
 *
 * @module workhorse-plugin-github/monitor-notifications
 */

import type { MonitorContext } from "workhorse-core";

import type { GitHubComment, GitHubReview } from "../types.ts";

/** Priority mapping for review states */
export const REVIEW_PRIORITIES: Record<
  GitHubReview["state"],
  "high" | "normal" | "low"
> = {
  CHANGES_REQUESTED: "high",
  APPROVED: "normal",
  COMMENTED: "low",
  DISMISSED: "low",
  PENDING: "low",
};

/** PR metadata for notifications */
export interface PRMeta {
  prNumber: number;
  owner: string;
  repo: string;
}

/** Create notifications for new reviews */
export async function createReviewNotifications(
  ctx: Pick<MonitorContext, "issueId" | "memory">,
  reviews: GitHubReview[],
  meta: PRMeta,
): Promise<void> {
  for (const review of reviews) {
    await ctx.memory.notifications.create({
      issueId: ctx.issueId,
      source: "github",
      sourceId: `github-review-${review.id}`,
      title: `PR Review: ${review.state.replace("_", " ").toLowerCase()} by ${review.user.login}`,
      body:
        review.body ||
        `${review.user.login} ${review.state.toLowerCase().replace("_", " ")} your PR`,
      priority: REVIEW_PRIORITIES[review.state],
      metadata: {
        reviewId: review.id,
        author: review.user.login,
        state: review.state,
        ...meta,
      },
    });
  }
}

/** Create notifications for new comments */
export async function createCommentNotifications(
  ctx: Pick<MonitorContext, "issueId" | "memory">,
  comments: GitHubComment[],
  meta: PRMeta,
): Promise<void> {
  for (const comment of comments) {
    const isReviewComment = comment.path !== undefined;
    await ctx.memory.notifications.create({
      issueId: ctx.issueId,
      source: "github",
      sourceId: `github-comment-${comment.id}`,
      title: isReviewComment
        ? `Review comment from ${comment.user.login} on ${comment.path}`
        : `Comment from ${comment.user.login}`,
      body: comment.body,
      priority: "normal",
      metadata: {
        commentId: comment.id,
        author: comment.user.login,
        ...meta,
        ...(isReviewComment
          ? {
              path: comment.path,
              line: comment.line,
              diffHunk: comment.diff_hunk,
            }
          : {}),
      },
    });
  }
}

/** Create notification for PR merge */
export function createMergedNotification(
  ctx: Pick<MonitorContext, "issueId" | "memory">,
  mergedBy: string | undefined,
  meta: PRMeta,
): void {
  ctx.memory.notifications.create({
    issueId: ctx.issueId,
    source: "github",
    sourceId: `github-merged-${meta.prNumber}`,
    title: `PR #${meta.prNumber} merged`,
    body: `PR was merged${mergedBy ? ` by ${mergedBy}` : ""}. No action needed.`,
    priority: "normal",
    metadata: { ...meta, mergedBy },
  });
}

/** Create notification for mergeable state changes */
export function createMergeableNotification(
  ctx: Pick<MonitorContext, "issueId" | "memory">,
  mergeableState: string,
  meta: PRMeta,
): void {
  if (mergeableState === "dirty") {
    ctx.memory.notifications.create({
      issueId: ctx.issueId,
      source: "github",
      sourceId: `github-mergeable-${Date.now()}`,
      title: "Merge conflicts detected",
      body: "This PR has merge conflicts that need to be resolved.",
      priority: "high",
      metadata: { ...meta, mergeableState },
    });
  } else if (mergeableState === "behind") {
    ctx.memory.notifications.create({
      issueId: ctx.issueId,
      source: "github",
      sourceId: `github-mergeable-${Date.now()}`,
      title: "Branch is behind base",
      body: "This PR's branch is behind the base branch and may need to be rebased or merged.",
      priority: "normal",
      metadata: { ...meta, mergeableState },
    });
  }
}
