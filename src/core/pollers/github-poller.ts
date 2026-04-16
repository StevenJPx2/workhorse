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
import { createNotification as realCreateNotification } from "../notifications/notification-store.ts";
import type { CreateNotificationInput, Notification } from "../notifications/types.ts";
import { createGitHubNotifications } from "./github-notifications.ts";

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
  /** Callback when new notifications are created - used to push updates to agent */
  onNotificationsCreated?: (notifications: Notification[]) => void;
  /** Optional override for createNotification (for testing) */
  createNotificationFn?: (db: Database, input: CreateNotificationInput) => Notification | null;
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

  const createNotif = options.createNotificationFn ?? realCreateNotification;

  const poll = async (): Promise<PollResult<GitHubPollResult>> => {
    const timestamp = new Date().toISOString();

    try {
      const [reviews, comments] = await Promise.all([
        options.fetchReviews(options.prNumber),
        options.fetchComments(options.prNumber),
      ]);

      // Find new items
      const newReviews = reviews.filter((r) => !lastReviewIds.has(r.id));
      const newComments = comments.filter((c) => !lastCommentIds.has(c.id));

      // Update tracking sets
      lastReviewIds = new Set(reviews.map((r) => r.id));
      lastCommentIds = new Set(comments.map((c) => c.id));

      // Create notifications
      const createdNotifications = createGitHubNotifications(
        options.db,
        options.ticketId,
        options.prNumber,
        newReviews,
        newComments,
        createNotif,
      );

      // Callbacks
      if (newReviews.length > 0) options.onNewReviews?.(newReviews);
      if (newComments.length > 0) options.onNewComments?.(newComments);
      if (createdNotifications.length > 0) options.onNotificationsCreated?.(createdNotifications);

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
    poll().catch(() => {});
    intervalId = setInterval(() => poll().catch(() => {}), options.interval);
  };

  const stop = (): void => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    state = "stopped";
  };

  if (options.autoStart) start();

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
