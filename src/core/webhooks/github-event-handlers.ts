/**
 * GitHub webhook event handlers
 *
 * Handles individual GitHub webhook events and creates notifications.
 * Looks up tickets by PR number in the database.
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
import type { Ticket } from "#types/ticket.ts";

export interface EventHandlerOptions {
  db: Database;
  onEvent?: (event: WebhookEvent) => void;
}

/**
 * Look up ticket by PR URL pattern in the database
 */
function findTicketByPr(
  db: Database,
  owner: string,
  repo: string,
  prNumber: number,
): Ticket | null {
  const pattern = `%github.com/${owner}/${repo}/pull/${prNumber}%`;
  const stmt = db.prepare("SELECT * FROM tickets WHERE pr_url LIKE ?");
  return stmt.get(pattern) as Ticket | null;
}

export function handlePrReview(
  payload: GitHubWebhookReviewPayload,
  options: EventHandlerOptions,
  receivedAt: string,
): WebhookResult {
  if (payload.action !== "submitted") return { success: true };

  const fullRepo = payload.repository.full_name;
  const [owner, repo] = fullRepo.split("/");
  const prNumber = payload.pull_request.number;
  const ticket = findTicketByPr(options.db, owner, repo, prNumber);

  if (!ticket) return { success: true };

  const review = payload.review;
  const priority: NotificationPriority = review.state === "changes_requested" ? "high" : "normal";

  const event: WebhookEvent = {
    source: "github",
    eventType: "github.pull_request_review",
    ticketId: ticket.id,
    prNumber,
    payload,
    receivedAt,
  };

  const notif = createNotification(options.db, {
    ticket_id: ticket.id,
    source_type: "github_pr_review",
    source_id: `review-${review.id}`,
    priority,
    summary: `PR review from ${review.user.login}: ${review.state.toUpperCase()}`,
    content: review.body || `Review state: ${review.state}`,
    author: review.user.login,
    source_timestamp: review.submitted_at,
    metadata: { prNumber, reviewId: review.id, repo: fullRepo },
  });

  options.onEvent?.(event);
  return { success: true, event, notificationIds: notif ? [notif.id] : [] };
}

export function handlePrReviewComment(
  payload: GitHubWebhookReviewCommentPayload,
  options: EventHandlerOptions,
  receivedAt: string,
): WebhookResult {
  if (payload.action !== "created") return { success: true };

  const fullRepo = payload.repository.full_name;
  const [owner, repo] = fullRepo.split("/");
  const prNumber = payload.pull_request.number;
  const ticket = findTicketByPr(options.db, owner, repo, prNumber);

  if (!ticket) return { success: true };

  const comment = payload.comment;
  const event: WebhookEvent = {
    source: "github",
    eventType: "github.pull_request_review_comment",
    ticketId: ticket.id,
    prNumber,
    payload,
    receivedAt,
  };

  const notif = createNotification(options.db, {
    ticket_id: ticket.id,
    source_type: "github_pr_comment",
    source_id: `comment-${comment.id}`,
    priority: "normal",
    summary: `PR comment from ${comment.user.login}`,
    content: comment.body,
    author: comment.user.login,
    source_timestamp: comment.created_at,
    metadata: {
      prNumber,
      commentId: comment.id,
      path: comment.path,
      line: comment.line,
      repo: fullRepo,
    },
  });

  options.onEvent?.(event);
  return { success: true, event, notificationIds: notif ? [notif.id] : [] };
}

export function handleIssueComment(
  payload: GitHubWebhookIssueCommentPayload,
  options: EventHandlerOptions,
  receivedAt: string,
): WebhookResult {
  if (!payload.issue.pull_request || payload.action !== "created") return { success: true };

  const fullRepo = payload.repository.full_name;
  const [owner, repo] = fullRepo.split("/");
  const prNumber = payload.issue.number;
  const ticket = findTicketByPr(options.db, owner, repo, prNumber);

  if (!ticket) return { success: true };

  const comment = payload.comment;
  const event: WebhookEvent = {
    source: "github",
    eventType: "github.issue_comment",
    ticketId: ticket.id,
    prNumber,
    payload,
    receivedAt,
  };

  const notif = createNotification(options.db, {
    ticket_id: ticket.id,
    source_type: "github_pr_comment",
    source_id: `issue-comment-${comment.id}`,
    priority: "normal",
    summary: `PR comment from ${comment.user.login}`,
    content: comment.body,
    author: comment.user.login,
    source_timestamp: comment.created_at,
    metadata: { prNumber, commentId: comment.id, repo: fullRepo },
  });

  options.onEvent?.(event);
  return { success: true, event, notificationIds: notif ? [notif.id] : [] };
}
