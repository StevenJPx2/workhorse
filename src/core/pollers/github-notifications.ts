/**
 * GitHub notification creation helpers
 *
 * Extracted from github-poller.ts to reduce file size.
 */

import type { Database } from "bun:sqlite";
import type { GitHubReview, GitHubComment } from "./types.ts";
import type { CreateNotificationInput, Notification } from "../notifications/types.ts";

/**
 * Create notification input for a GitHub review
 */
export function createReviewNotificationInput(
  ticketId: string,
  prNumber: number,
  review: GitHubReview,
): CreateNotificationInput {
  const priority = review.state === "CHANGES_REQUESTED" ? "high" : "normal";
  return {
    ticket_id: ticketId,
    source_type: "github_pr_review",
    source_id: `review-${review.id}`,
    priority,
    summary: `PR review from ${review.user}: ${review.state}`,
    content: review.body || `Review state: ${review.state}`,
    author: review.user,
    source_timestamp: review.submittedAt,
    metadata: { prNumber, reviewId: review.id },
  };
}

/**
 * Create notification input for a GitHub comment
 */
export function createCommentNotificationInput(
  ticketId: string,
  prNumber: number,
  comment: GitHubComment,
): CreateNotificationInput {
  return {
    ticket_id: ticketId,
    source_type: "github_pr_comment",
    source_id: `comment-${comment.id}`,
    priority: "normal",
    summary: `PR comment from ${comment.user}`,
    content: comment.body,
    author: comment.user,
    source_timestamp: comment.createdAt,
    metadata: {
      prNumber,
      commentId: comment.id,
      path: comment.path,
      line: comment.line,
    },
  };
}

/**
 * Create notifications for new reviews and comments
 */
export function createGitHubNotifications(
  db: Database,
  ticketId: string,
  prNumber: number,
  newReviews: GitHubReview[],
  newComments: GitHubComment[],
  createNotif: (db: Database, input: CreateNotificationInput) => Notification | null,
): Notification[] {
  const notifications: Notification[] = [];

  for (const review of newReviews) {
    const input = createReviewNotificationInput(ticketId, prNumber, review);
    const notif = createNotif(db, input);
    if (notif) notifications.push(notif);
  }

  for (const comment of newComments) {
    const input = createCommentNotificationInput(ticketId, prNumber, comment);
    const notif = createNotif(db, input);
    if (notif) notifications.push(notif);
  }

  return notifications;
}
