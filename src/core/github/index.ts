/**
 * GitHub module - Core GitHub integration with no UI dependencies
 */

// Client
export { GitHubClient, createGitHubClient } from "./client.ts";
export { GitHubConnection } from "./github-connection.ts";

// Mappers
export {
  mapPullRequest,
  mapReviewComment,
  mapPRReview,
  parseMcpResponse,
  extractTextContent,
} from "./mappers.ts";

// Types
export type {
  GitHubPullRequest,
  GitHubReviewComment,
  GitHubPRReview,
  CreateReviewParams,
  ReviewCommentParams,
  ReviewState,
  McpToolResultContent,
  GitHubClientOptions,
} from "./types.ts";

// Re-export the interface under its original name for convenience
export type { GitHubClient as GitHubClientInterface } from "./types.ts";
