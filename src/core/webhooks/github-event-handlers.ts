/**
 * GitHub webhook event handlers
 */

import type { Database } from "bun:sqlite";
import type {
  WebhookResult,
  WebhookEvent,
  GitHubWebhookReviewPayload,
  GitHubWebhookReviewCommentPayload,
  GitHubWebhookIssueCommentPayload,
} from "./types.ts";
import { createNotification } from "../notifications/notification-store.ts";
import type { NotificationPriority } from "../notifications/types.ts";

export interface EventHandlerOptions {
  db: Database;
  onEvent?: (event: WebhookEvent) => void;
}

export function getTicketIdForPr(
  prToTicketMap: Map<string, string>,
  repo: string,
  prNumber: number,
): string | null {
  const key = `${repo}#${prNumber}`;
  return prToTicketMap.get(key) ?? null;
}

export function handlePrReview(
  payload: GitHubWebhookReviewPayload,
  options: EventHandlerOptions,
  receivedAt: string,
  prToTicketMap: Map<string, string>,
): WebhookResult {
  if (payload.action !== "submitted") return { success: true };

  const repo = payload.repository.full_name;
  const prNumber = payload.pull_request.number;
  const ticketId = getTicketIdForPr(prToTicketMap, repo, prNumber);

  if (!ticketId) return { success: true };

  const review = payload.review;
  const priority: NotificationPriority = review.state === "changes_requested" ? "high" : "normal";

  const event: WebhookEvent = {
    source: "github",
    eventType: "github.pull_request_review",
    ticketId,
    prNumber,
    payload,
    receivedAt,
  };

  const notif = createNotification(options.db, {
    ticket_id: ticketId,
    source_type: "github_pr_review",
    source_id: `review-${review.id}`,
    priority,
    summary: `PR review from ${review.user.login}: ${review.state.toUpperCase()}`,
    content: review.body || `Review state: ${review.state}`,
    author: review.user.login,
    source_timestamp: review.submitted_at,
    metadata: { prNumber, reviewId: review.id, repo },
  });

  options.onEvent?.(event);
  return { success: true, event, notificationIds: notif ? [notif.id] : [] };
}

export function handlePrReviewComment(
  payload: GitHubWebhookReviewCommentPayload,
  options: EventHandlerOptions,
  receivedAt: string,
  prToTicketMap: Map<string, string>,
): WebhookResult {
  if (payload.action !== "created") return { success: true };

  const repo = payload.repository.full_name;
  const prNumber = payload.pull_request.number;
  const ticketId = getTicketIdForPr(prToTicketMap, repo, prNumber);

  if (!ticketId) return { success: true };

  const comment = payload.comment;
  const event: WebhookEvent = {
    source: "github",
    eventType: "github.pull_request_review_comment",
    ticketId,
    prNumber,
    payload,
    receivedAt,
  };

  const notif = createNotification(options.db, {
    ticket_id: ticketId,
    source_type: "github_pr_comment",
    source_id: `comment-${comment.id}`,
    priority: "normal",
    summary: `PR comment from ${comment.user.login}`,
    content: comment.body,
    author: comment.user.login,
    source_timestamp: comment.created_at,
    metadata: { prNumber, commentId: comment.id, path: comment.path, line: comment.line, repo },
  });

  options.onEvent?.(event);
  return { success: true, event, notificationIds: notif ? [notif.id] : [] };
}

export function handleIssueComment(
  payload: GitHubWebhookIssueCommentPayload,
  options: EventHandlerOptions,
  receivedAt: string,
  prToTicketMap: Map<string, string>,
): WebhookResult {
  if (!payload.issue.pull_request || payload.action !== "created") return { success: true };

  const repo = payload.repository.full_name;
  const prNumber = payload.issue.number;
  const ticketId = getTicketIdForPr(prToTicketMap, repo, prNumber);

  if (!ticketId) return { success: true };

  const comment = payload.comment;
  const event: WebhookEvent = {
    source: "github",
    eventType: "github.issue_comment",
    ticketId,
    prNumber,
    payload,
    receivedAt,
  };

  const notif = createNotification(options.db, {
    ticket_id: ticketId,
    source_type: "github_pr_comment",
    source_id: `issue-comment-${comment.id}`,
    priority: "normal",
    summary: `PR comment from ${comment.user.login}`,
    content: comment.body,
    author: comment.user.login,
    source_timestamp: comment.created_at,
    metadata: { prNumber, commentId: comment.id, repo },
  });

  options.onEvent?.(event);
  return { success: true, event, notificationIds: notif ? [notif.id] : [] };
}
