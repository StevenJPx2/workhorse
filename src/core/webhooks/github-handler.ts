/**
 * GitHub webhook handler
 *
 * Processes incoming GitHub webhooks for PR reviews and comments.
 */

import type { Database } from "bun:sqlite";
import type {
  WebhookResult,
  WebhookEvent,
  GitHubWebhookReviewPayload,
  GitHubWebhookReviewCommentPayload,
  GitHubWebhookIssueCommentPayload,
} from "./types.ts";
import { verifyGitHubSignature } from "./crypto.ts";
import {
  handlePrReview,
  handlePrReviewComment,
  handleIssueComment,
} from "./github-event-handlers.ts";

/** Map PR numbers to ticket IDs (set by hybrid controller) */
const prToTicketMap = new Map<string, string>();

/**
 * Register a PR -> ticket mapping for webhook routing
 */
export function registerPrTicketMapping(repo: string, prNumber: number, ticketId: string): void {
  const key = `${repo}#${prNumber}`;
  prToTicketMap.set(key, ticketId);
}

/**
 * Unregister a PR -> ticket mapping
 */
export function unregisterPrTicketMapping(repo: string, prNumber: number): void {
  const key = `${repo}#${prNumber}`;
  prToTicketMap.delete(key);
}

export interface GitHubHandlerOptions {
  db: Database;
  secret?: string;
  onEvent?: (event: WebhookEvent) => void;
}

/**
 * Create a GitHub webhook handler
 */
export function createGitHubHandler(options: GitHubHandlerOptions) {
  return async (
    payload: unknown,
    headers: Record<string, string>,
    rawBody: string,
  ): Promise<WebhookResult> => {
    const receivedAt = new Date().toISOString();

    // Verify signature if secret is configured
    if (options.secret) {
      const signature = headers["x-hub-signature-256"];
      if (!signature) {
        return { success: false, error: "Missing signature header" };
      }
      const valid = await verifyGitHubSignature(rawBody, signature, options.secret);
      if (!valid) {
        return { success: false, error: "Invalid signature" };
      }
    }

    const eventType = headers["x-github-event"];
    if (!eventType) {
      return { success: false, error: "Missing X-GitHub-Event header" };
    }

    const handlerOptions = { db: options.db, onEvent: options.onEvent };

    try {
      switch (eventType) {
        case "pull_request_review":
          return handlePrReview(
            payload as GitHubWebhookReviewPayload,
            handlerOptions,
            receivedAt,
            prToTicketMap,
          );

        case "pull_request_review_comment":
          return handlePrReviewComment(
            payload as GitHubWebhookReviewCommentPayload,
            handlerOptions,
            receivedAt,
            prToTicketMap,
          );

        case "issue_comment":
          return handleIssueComment(
            payload as GitHubWebhookIssueCommentPayload,
            handlerOptions,
            receivedAt,
            prToTicketMap,
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
