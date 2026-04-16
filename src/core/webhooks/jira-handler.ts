/**
 * Jira webhook handler
 *
 * Processes incoming Jira webhooks for issue comments.
 */

import type { Database } from "bun:sqlite";
import type { WebhookResult, WebhookEvent, JiraWebhookPayload } from "./types.ts";
import { verifyJiraSignature } from "./crypto.ts";
import { createNotification } from "../notifications/notification-store.ts";

/** Set of ticket IDs we're tracking */
const trackedTickets = new Set<string>();

/**
 * Register a ticket for webhook tracking
 */
export function registerTrackedTicket(ticketId: string): void {
  trackedTickets.add(ticketId);
}

/**
 * Unregister a ticket from webhook tracking
 */
export function unregisterTrackedTicket(ticketId: string): void {
  trackedTickets.delete(ticketId);
}

/**
 * Check if a ticket is being tracked
 */
function isTicketTracked(ticketId: string): boolean {
  return trackedTickets.has(ticketId);
}

export interface JiraHandlerOptions {
  db: Database;
  secret?: string;
  onEvent?: (event: WebhookEvent) => void;
}

/**
 * Create a Jira webhook handler
 */
export function createJiraHandler(options: JiraHandlerOptions) {
  return async (
    payload: unknown,
    headers: Record<string, string>,
    _rawBody: string,
  ): Promise<WebhookResult> => {
    const receivedAt = new Date().toISOString();

    // Verify signature if secret is configured
    if (options.secret) {
      const providedSecret = headers["x-jira-webhook-secret"];
      if (!verifyJiraSignature(providedSecret, options.secret)) {
        return { success: false, error: "Invalid or missing secret" };
      }
    }

    const jiraPayload = payload as JiraWebhookPayload;

    if (!jiraPayload.issue?.key) {
      return { success: false, error: "Missing issue key in payload" };
    }

    const ticketId = jiraPayload.issue.key;

    // Only process events for tracked tickets
    if (!isTicketTracked(ticketId)) {
      return { success: true }; // Silently ignore
    }

    try {
      const webhookEvent = jiraPayload.webhookEvent;

      if (webhookEvent === "comment_created" || webhookEvent === "comment_updated") {
        return handleComment(jiraPayload, options, receivedAt);
      }

      // Ignore other events
      return { success: true };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return { success: false, error: err.message };
    }
  };
}

function handleComment(
  payload: JiraWebhookPayload,
  options: JiraHandlerOptions,
  receivedAt: string,
): WebhookResult {
  const comment = payload.comment;
  if (!comment) {
    return { success: false, error: "Missing comment in payload" };
  }

  const ticketId = payload.issue.key;

  const event: WebhookEvent = {
    source: "jira",
    eventType:
      payload.webhookEvent === "comment_created" ? "jira.comment_created" : "jira.comment_updated",
    ticketId,
    payload,
    receivedAt,
  };

  // Only create notification for new comments (not updates)
  if (payload.webhookEvent !== "comment_created") {
    options.onEvent?.(event);
    return { success: true, event };
  }

  const notif = createNotification(options.db, {
    ticket_id: ticketId,
    source_type: "jira_comment",
    source_id: comment.id,
    priority: "normal",
    summary: `New comment from ${comment.author.displayName}`,
    content: comment.body,
    author: comment.author.displayName,
    source_timestamp: comment.created,
    metadata: { authorAccountId: comment.author.accountId },
  });

  options.onEvent?.(event);

  return {
    success: true,
    event,
    notificationIds: notif ? [notif.id] : [],
  };
}
