/**
 * Notification watcher
 *
 * Watches the notification database for new unread notifications
 * and injects them into the agent's conversation via <system_inbox>.
 *
 * This runs in the orchestrator/TUI process, not in the MCP server process,
 * so it has access to inject messages into the agent's tmux session.
 */

import type { Database } from "bun:sqlite";
import type { BasePollerOptions, PollerState, PollResult, Poller } from "./types.ts";
import {
  getUnreadNotifications,
  markNotificationRead,
} from "../notifications/notification-store.ts";
import type { Notification } from "../notifications/types.ts";
import { injectSystemInbox } from "../agent/orchestrator/orchestrator.ts";

/**
 * Result of notification watcher poll
 */
export interface NotificationWatcherResult {
  ticketId: string;
  /** Notifications that were detected and injected */
  injectedNotifications: Notification[];
  /** Whether injection was successful */
  injected: boolean;
}

/**
 * Options for notification watcher
 */
export interface NotificationWatcherOptions extends BasePollerOptions {
  /** Database for reading notifications */
  db: Database;
  /** Ticket ID to watch notifications for */
  ticketId: string;
  /** Callback when notifications are injected */
  onNotificationsInjected?: (notifications: Notification[]) => void;
}

/**
 * Create a notification watcher that monitors the database for new notifications
 * and injects them into the agent's conversation.
 *
 * @example
 * ```ts
 * const watcher = createNotificationWatcher({
 *   db,
 *   ticketId: 'AM-123',
 *   interval: 5000, // Check every 5 seconds
 *   autoStart: true,
 *   onNotificationsInjected: (notifications) => {
 *     console.log(`Injected ${notifications.length} notifications`);
 *   },
 * });
 * ```
 */
export function createNotificationWatcher(
  options: NotificationWatcherOptions,
): Poller<NotificationWatcherResult> {
  let state: PollerState = "idle";
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let lastResult: PollResult<NotificationWatcherResult> | null = null;

  const poll = async (): Promise<PollResult<NotificationWatcherResult>> => {
    const timestamp = new Date().toISOString();

    try {
      // Get unread notifications for this ticket
      const unreadNotifications = getUnreadNotifications(options.db, options.ticketId);

      if (unreadNotifications.length === 0) {
        const result: PollResult<NotificationWatcherResult> = {
          success: true,
          data: {
            ticketId: options.ticketId,
            injectedNotifications: [],
            injected: false,
          },
          timestamp,
        };
        lastResult = result;
        return result;
      }

      // Try to inject the notifications into the agent
      const injected = await injectSystemInbox(options.ticketId, unreadNotifications);

      if (injected) {
        // Mark notifications as read so we don't inject them again
        // The agent will call jiratown_acknowledge to mark them as acknowledged
        for (const notif of unreadNotifications) {
          markNotificationRead(options.db, notif.id);
        }

        // Callback
        options.onNotificationsInjected?.(unreadNotifications);
      }

      const result: PollResult<NotificationWatcherResult> = {
        success: true,
        data: {
          ticketId: options.ticketId,
          injectedNotifications: injected ? unreadNotifications : [],
          injected,
        },
        timestamp,
      };

      lastResult = result;
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      options.onError?.(err);
      state = "error";

      const result: PollResult<NotificationWatcherResult> = {
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
