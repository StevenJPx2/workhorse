/**
 * Jira webhook handler
 *
 * Processes incoming Jira webhooks for issue comments.
 * Looks up tickets by Jira key in the database.
 */

import type { Database } from "bun:sqlite";
import type { WebhookResult, WebhookEvent, JiraWebhookPayload } from "./types.ts";
import { createNotification } from "../notifications/notification-store.ts";
import type { Ticket } from "#types/ticket.ts";

export interface JiraHandlerOptions {
  db: Database;
  onEvent?: (event: WebhookEvent) => void;
}

/**
 * Look up ticket by Jira key in the database
 */
function findTicketByJiraKey(db: Database, jiraKey: string): Ticket | null {
  const stmt = db.prepare("SELECT * FROM tickets WHERE jira_key = ?");
  return stmt.get(jiraKey) as Ticket | null;
}

/**
 * Create a Jira webhook handler
 */
export function createJiraHandler(options: JiraHandlerOptions) {
  return async (
    payload: unknown,
    _headers: Record<string, string>,
    _rawBody: string,
  ): Promise<WebhookResult> => {
    const receivedAt = new Date().toISOString();
    const jiraPayload = payload as JiraWebhookPayload;

    if (!jiraPayload.issue?.key) {
      return { success: false, error: "Missing issue key in payload" };
    }

    const jiraKey = jiraPayload.issue.key;
    const ticket = findTicketByJiraKey(options.db, jiraKey);

    // Only process events for tickets we're tracking
    if (!ticket) {
      return { success: true };
    }

    try {
      const webhookEvent = jiraPayload.webhookEvent;
      if (webhookEvent === "comment_created" || webhookEvent === "comment_updated") {
        return handleComment(jiraPayload, ticket.id, options, receivedAt);
      }
      return { success: true };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return { success: false, error: err.message };
    }
  };
}

function handleComment(
  payload: JiraWebhookPayload,
  ticketId: string,
  options: JiraHandlerOptions,
  receivedAt: string,
): WebhookResult {
  const comment = payload.comment;
  if (!comment) {
    return { success: false, error: "Missing comment in payload" };
  }

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
  return { success: true, event, notificationIds: notif ? [notif.id] : [] };
}
