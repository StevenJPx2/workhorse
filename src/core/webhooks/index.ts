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

// Crypto utilities
export { verifyGitHubSignature, verifyJiraSignature } from "./crypto.ts";

// Handlers
export {
  createGitHubHandler,
  registerPrTicketMapping,
  unregisterPrTicketMapping,
  type GitHubHandlerOptions,
} from "./github-handler.ts";

export {
  createJiraHandler,
  registerTrackedTicket,
  unregisterTrackedTicket,
  type JiraHandlerOptions,
} from "./jira-handler.ts";

// Server
export { createWebhookServer, type CreateWebhookServerOptions } from "./server.ts";

// Hybrid controller
export { createHybridController } from "./hybrid-controller.ts";
export type {
  HybridMode,
  HybridControllerConfig,
  TrackedPr,
  TrackedTicket,
  HybridController,
} from "./hybrid-types.ts";
