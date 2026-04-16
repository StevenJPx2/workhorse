/**
 * Webhook system exports
 */

// Types
export type {
  WebhookSource,
  WebhookEventType,
  WebhookEvent,
  WebhookResult,
  WebhookHandler,
  WebhookServerConfig,
  WebhookServer,
  GitHubWebhookReviewPayload,
  GitHubWebhookReviewCommentPayload,
  GitHubWebhookIssueCommentPayload,
  JiraWebhookPayload,
} from "./types.ts";

// Handlers
export { createGitHubHandler, type GitHubHandlerOptions } from "./github-handler.ts";
export { createJiraHandler, type JiraHandlerOptions } from "./jira-handler.ts";

// Server
export { createWebhookServer, type CreateWebhookServerOptions } from "./server.ts";

// Hybrid controller
export { createHybridController } from "./hybrid-controller.ts";
export type {
  HybridControllerConfig,
  TrackedPr,
  TrackedTicket,
  HybridController,
} from "./hybrid-types.ts";
