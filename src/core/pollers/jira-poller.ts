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
import { createNotification as realCreateNotification } from "../notifications/notification-store.ts";
import type { CreateNotificationInput, Notification } from "../notifications/types.ts";

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
  /** Callback when new notifications are created - used to push updates to agent */
  onNotificationsCreated?: (notifications: Notification[]) => void;
  /** Optional override for createNotification (for testing) */
  createNotificationFn?: (db: Database, input: CreateNotificationInput) => Notification | null;
}

/**
 * Create a Jira comment poller
 */
export function createJiraPoller(options: JiraPollerOptions): Poller<JiraPollResult> {
  let state: PollerState = "idle";
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let lastResult: PollResult<JiraPollResult> | null = null;
  let lastCommentIds = new Set<string>();

  // Use injected function or default to real implementation
  const createNotif = options.createNotificationFn ?? realCreateNotification;

  const poll = async (): Promise<PollResult<JiraPollResult>> => {
    const timestamp = new Date().toISOString();

    try {
      const comments = await options.fetchComments(options.ticketId);

      // Find new comments
      const newComments = comments.filter((c) => !lastCommentIds.has(c.id));

      // Update tracking set
      lastCommentIds = new Set(comments.map((c) => c.id));

      // Collect created notifications to push to agent
      const createdNotifications: Notification[] = [];

      // Create notifications for new comments
      for (const comment of newComments) {
        const notif = createNotif(options.db, {
          ticket_id: options.ticketId,
          source_type: "jira_comment",
          source_id: comment.id,
          priority: "normal",
          summary: `New comment from ${comment.author}`,
          content: comment.body,
          author: comment.author,
          source_timestamp: comment.created,
        });
        if (notif) {
          createdNotifications.push(notif);
        }
      }

      // Callback
      if (newComments.length > 0) {
        options.onNewComments?.(newComments);
      }

      // Push notifications to agent if callback provided
      if (createdNotifications.length > 0) {
        options.onNotificationsCreated?.(createdNotifications);
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
