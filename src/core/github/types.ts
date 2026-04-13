/**
 * GitHub types - Core data structures with no UI dependencies
 */

/**
 * GitHub Pull Request data
 */
export interface GitHubPullRequest {
  /** PR number */
  number: number;
  /** PR title */
  title: string;
  /** PR body/description */
  body: string | null;
  /** PR state: open, closed, merged */
  state: "open" | "closed" | "merged";
  /** Whether the PR is a draft */
  draft: boolean;
  /** Head branch name */
  headBranch: string;
  /** Base branch name */
  baseBranch: string;
  /** PR URL */
  url: string;
  /** Author username */
  author: string;
  /** Created at ISO timestamp */
  createdAt: string;
  /** Updated at ISO timestamp */
  updatedAt: string;
  /** Mergeable state */
  mergeableState: string | null;
  /** Additions count */
  additions: number;
  /** Deletions count */
  deletions: number;
  /** Changed files count */
  changedFiles: number;
}

/**
 * GitHub review comment on a PR
 */
export interface GitHubReviewComment {
  /** Comment ID */
  id: number;
  /** Review ID this comment belongs to (if part of a review) */
  reviewId: number | null;
  /** Comment author username */
  user: string;
  /** Comment body text */
  body: string;
  /** File path (for inline comments) */
  path: string | null;
  /** Line number (for inline comments) */
  line: number | null;
  /** Original line number (for inline comments on outdated diffs) */
  originalLine: number | null;
  /** Side of the diff (LEFT or RIGHT) */
  side: "LEFT" | "RIGHT" | null;
  /** Whether comment was resolved */
  isResolved: boolean;
  /** Created at ISO timestamp */
  createdAt: string;
  /** Updated at ISO timestamp */
  updatedAt: string;
  /** In-reply-to comment ID (for threaded comments) */
  inReplyToId: number | null;
}

/**
 * GitHub PR review
 */
export interface GitHubPRReview {
  /** Review ID */
  id: number;
  /** Reviewer username */
  user: string;
  /** Review state: APPROVED, CHANGES_REQUESTED, COMMENTED, PENDING */
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING";
  /** Review body/comment */
  body: string;
  /** Submitted at ISO timestamp */
  submittedAt: string;
}

/**
 * Parameters for creating a PR review
 */
export interface CreateReviewParams {
  /** Review body text */
  body: string;
  /** Review event: APPROVE, REQUEST_CHANGES, COMMENT */
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
  /** Inline comments on specific lines */
  comments?: ReviewCommentParams[];
}

/**
 * Parameters for a single inline review comment
 */
export interface ReviewCommentParams {
  /** File path */
  path: string;
  /** Line number in the diff */
  line: number;
  /** Comment body */
  body: string;
  /** Side of the diff (LEFT or RIGHT) */
  side?: "LEFT" | "RIGHT";
}

/**
 * Review state summary for a PR
 */
export type ReviewState = "pending" | "approved" | "changes_requested" | "commented";

/**
 * MCP tool call result content item
 */
export interface McpToolResultContent {
  type: "text";
  text: string;
}

/**
 * Options for creating a GitHub client
 */
export interface GitHubClientOptions {
  /** No additional options needed - authentication is handled by mcp-remote OAuth */
}

/**
 * Interface for GitHub client operations
 *
 * This allows dependency injection for testing
 */
export interface GitHubClient {
  /** Whether connected to the MCP server */
  readonly isConnected: boolean;

  /** Connect to the GitHub MCP server */
  connect(): Promise<void>;

  /** Disconnect from the GitHub MCP server */
  disconnect(): Promise<void>;

  /** Get a pull request by number */
  getPullRequest(owner: string, repo: string, number: number): Promise<GitHubPullRequest>;

  /** List pull requests for a repository */
  listPullRequests(
    owner: string,
    repo: string,
    state?: "open" | "closed" | "all",
  ): Promise<GitHubPullRequest[]>;

  /** List review comments on a pull request */
  listReviewComments(owner: string, repo: string, number: number): Promise<GitHubReviewComment[]>;

  /** List reviews on a pull request */
  listReviews(owner: string, repo: string, number: number): Promise<GitHubPRReview[]>;

  /** Create a review on a pull request */
  createReview(
    owner: string,
    repo: string,
    number: number,
    params: CreateReviewParams,
  ): Promise<void>;

  /** Submit a reply comment on a pull request */
  createReviewComment(
    owner: string,
    repo: string,
    number: number,
    body: string,
    inReplyTo?: number,
  ): Promise<void>;
}
