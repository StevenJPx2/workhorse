/**
 * GitHub PR poller
 *
 * Polls GitHub for new reviews and comments on PRs.
 */

import type { Database } from "bun:sqlite";
import type {
  BasePollerOptions,
  PollerState,
  PollResult,
  GitHubPollResult,
  GitHubReview,
  GitHubComment,
  Poller,
} from "./types.ts";
import { createNotification } from "../notifications/notification-store.ts";

/**
 * Options for GitHub poller
 */
export interface GitHubPollerOptions extends BasePollerOptions {
  /** Database for storing notifications */
  db: Database;
  /** Ticket ID this PR is for */
  ticketId: string;
  /** PR number to poll */
  prNumber: number;
  /** Function to fetch reviews from GitHub */
  fetchReviews: (prNumber: number) => Promise<GitHubReview[]>;
  /** Function to fetch comments from GitHub */
  fetchComments: (prNumber: number) => Promise<GitHubComment[]>;
  /** Callback when new reviews detected */
  onNewReviews?: (reviews: GitHubReview[]) => void;
  /** Callback when new comments detected */
  onNewComments?: (comments: GitHubComment[]) => void;
}

/**
 * Create a GitHub PR poller
 */
export function createGitHubPoller(options: GitHubPollerOptions): Poller<GitHubPollResult> {
  let state: PollerState = "idle";
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let lastResult: PollResult<GitHubPollResult> | null = null;
  let lastReviewIds = new Set<number>();
  let lastCommentIds = new Set<number>();

  const poll = async (): Promise<PollResult<GitHubPollResult>> => {
    const timestamp = new Date().toISOString();

    try {
      const [reviews, comments] = await Promise.all([
        options.fetchReviews(options.prNumber),
        options.fetchComments(options.prNumber),
      ]);

      // Find new reviews
      const newReviews = reviews.filter((r) => !lastReviewIds.has(r.id));
      lastReviewIds = new Set(reviews.map((r) => r.id));

      // Find new comments
      const newComments = comments.filter((c) => !lastCommentIds.has(c.id));
      lastCommentIds = new Set(comments.map((c) => c.id));

      // Create notifications for new reviews
      for (const review of newReviews) {
        const priority = review.state === "CHANGES_REQUESTED" ? "high" : "normal";
        createNotification(options.db, {
          ticket_id: options.ticketId,
          source_type: "github_pr_review",
          source_id: `review-${review.id}`,
          priority,
          summary: `PR review from ${review.user}: ${review.state}`,
          content: review.body || `Review state: ${review.state}`,
          author: review.user,
          source_timestamp: review.submittedAt,
          metadata: { prNumber: options.prNumber, reviewId: review.id },
        });
      }

      // Create notifications for new comments
      for (const comment of newComments) {
        createNotification(options.db, {
          ticket_id: options.ticketId,
          source_type: "github_pr_comment",
          source_id: `comment-${comment.id}`,
          priority: "normal",
          summary: `PR comment from ${comment.user}`,
          content: comment.body,
          author: comment.user,
          source_timestamp: comment.createdAt,
          metadata: {
            prNumber: options.prNumber,
            commentId: comment.id,
            path: comment.path,
            line: comment.line,
          },
        });
      }

      // Callbacks
      if (newReviews.length > 0) {
        options.onNewReviews?.(newReviews);
      }
      if (newComments.length > 0) {
        options.onNewComments?.(newComments);
      }

      const result: PollResult<GitHubPollResult> = {
        success: true,
        data: {
          ticketId: options.ticketId,
          prNumber: options.prNumber,
          reviews,
          comments,
          newReviews,
          newComments,
        },
        timestamp,
      };

      lastResult = result;
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      options.onError?.(err);
      state = "error";

      const result: PollResult<GitHubPollResult> = {
        success: false,
        error: err.message,
        timestamp,
      };

      lastResult = result;
      return result;
    }
  };

  const start = (): void => {
    if (state === "running") return;

    state = "running";

    // Initial poll
    poll().catch(() => {
      // Error handled in poll
    });

    // Set up interval
    intervalId = setInterval(() => {
      poll().catch(() => {
        // Error handled in poll
      });
    }, options.interval);
  };

  const stop = (): void => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    state = "stopped";
  };

  // Auto-start if requested
  if (options.autoStart) {
    start();
  }

  return {
    get state() {
      return state;
    },
    start,
    stop,
    poll,
    lastResult: () => lastResult,
  };
}
