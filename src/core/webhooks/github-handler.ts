/**
 * GitHub webhook handler
 *
 * Processes incoming GitHub webhooks for PR reviews and comments.
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
import {
  handlePrReview,
  handlePrReviewComment,
  handleIssueComment,
} from "./github-event-handlers.ts";

export interface GitHubHandlerOptions {
  db: Database;
  onEvent?: (event: WebhookEvent) => void;
}

/**
 * Create a GitHub webhook handler
 */
export function createGitHubHandler(options: GitHubHandlerOptions) {
  return async (
    payload: unknown,
    headers: Record<string, string>,
    _rawBody: string,
  ): Promise<WebhookResult> => {
    const receivedAt = new Date().toISOString();

    const eventType = headers["x-github-event"];
    if (!eventType) {
      return { success: false, error: "Missing X-GitHub-Event header" };
    }

    const handlerOptions = { db: options.db, onEvent: options.onEvent };

    try {
      switch (eventType) {
        case "pull_request_review":
          return handlePrReview(payload as GitHubWebhookReviewPayload, handlerOptions, receivedAt);

        case "pull_request_review_comment":
          return handlePrReviewComment(
            payload as GitHubWebhookReviewCommentPayload,
            handlerOptions,
            receivedAt,
          );

        case "issue_comment":
          return handleIssueComment(
            payload as GitHubWebhookIssueCommentPayload,
            handlerOptions,
            receivedAt,
          );

        default:
          return { success: true };
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return { success: false, error: err.message };
    }
  };
}
