/**
 * Jira comment poller
 *
 * Polls Jira for new comments on tickets and creates notifications.
 */

import type { Database } from "bun:sqlite";
import type {
  BasePollerOptions,
  PollerState,
  PollResult,
  JiraPollResult,
  JiraComment,
  Poller,
} from "./types.ts";
import { createNotification } from "../notifications/notification-store.ts";

/**
 * Options for Jira poller
 */
export interface JiraPollerOptions extends BasePollerOptions {
  /** Database for storing notifications */
  db: Database;
  /** Ticket ID to poll */
  ticketId: string;
  /** Function to fetch comments from Jira */
  fetchComments: (ticketId: string) => Promise<JiraComment[]>;
  /** Callback when new comments detected */
  onNewComments?: (comments: JiraComment[]) => void;
}

/**
 * Create a Jira comment poller
 */
export function createJiraPoller(options: JiraPollerOptions): Poller<JiraPollResult> {
  let state: PollerState = "idle";
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let lastResult: PollResult<JiraPollResult> | null = null;
  let lastCommentIds = new Set<string>();

  const poll = async (): Promise<PollResult<JiraPollResult>> => {
    const timestamp = new Date().toISOString();

    try {
      const comments = await options.fetchComments(options.ticketId);

      // Find new comments
      const newComments = comments.filter((c) => !lastCommentIds.has(c.id));

      // Update tracking set
      lastCommentIds = new Set(comments.map((c) => c.id));

      // Create notifications for new comments
      for (const comment of newComments) {
        createNotification(options.db, {
          ticket_id: options.ticketId,
          source_type: "jira_comment",
          source_id: comment.id,
          priority: "normal",
          summary: `New comment from ${comment.author}`,
          content: comment.body,
          author: comment.author,
          source_timestamp: comment.created,
        });
      }

      // Callback
      if (newComments.length > 0) {
        options.onNewComments?.(newComments);
      }

      const result: PollResult<JiraPollResult> = {
        success: true,
        data: {
          ticketId: options.ticketId,
          comments,
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

      const result: PollResult<JiraPollResult> = {
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
