/**
 * Types for useGitHub hook
 */

import type {
  GitHubPullRequest,
  GitHubReviewComment,
  GitHubPRReview,
  CreateReviewParams,
} from "#core/github/types.ts";
import type { GitHubClient } from "#core/github/types.ts";

/**
 * Options for the useGitHub hook
 */
export interface UseGitHubOptions {
  /** Whether to connect automatically on mount */
  autoConnect?: boolean;
  /** Callback when connection state changes */
  onConnectionChange?: (connected: boolean) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

/**
 * Return type for the useGitHub hook
 */
export interface UseGitHubReturn {
  /** Whether connected to the GitHub MCP server */
  isConnected: () => boolean;
  /** Whether currently connecting */
  isConnecting: () => boolean;
  /** Last error, if any */
  error: () => Error | null;

  /** Connect to the GitHub MCP server */
  connect: () => Promise<void>;
  /** Disconnect from the GitHub MCP server */
  disconnect: () => Promise<void>;

  /** Get a pull request by number */
  getPullRequest: (owner: string, repo: string, number: number) => Promise<GitHubPullRequest>;
  /** List pull requests for a repository */
  listPullRequests: (
    owner: string,
    repo: string,
    state?: "open" | "closed" | "all",
  ) => Promise<GitHubPullRequest[]>;
  /** List review comments on a pull request */
  listReviewComments: (
    owner: string,
    repo: string,
    number: number,
  ) => Promise<GitHubReviewComment[]>;
  /** List reviews on a pull request */
  listReviews: (owner: string, repo: string, number: number) => Promise<GitHubPRReview[]>;
  /** Create a review on a pull request */
  createReview: (
    owner: string,
    repo: string,
    number: number,
    params: CreateReviewParams,
  ) => Promise<void>;
  /** Submit a reply comment on a pull request */
  createReviewComment: (
    owner: string,
    repo: string,
    number: number,
    body: string,
    inReplyTo?: number,
  ) => Promise<void>;
}

/**
 * Dependencies for useGitHub hook (for testing)
 */
export interface UseGitHubDeps {
  createClient: () => GitHubClient;
}
