/**
 * Types for usePRReview hook
 *
 * Manages PR review workflow state including:
 * - Polling for new comments/change requests
 * - Tracking review state (pending, approved, changes_requested)
 * - Drafting and submitting replies
 * - Workflow actions (reply only, reply + address, address all)
 */

import type { GitHubPRReview, GitHubReviewComment, ReviewState } from "#core/github/types.ts";

/**
 * A comment with its draft reply
 */
export interface CommentWithDraft {
  /** Original GitHub comment */
  comment: GitHubReviewComment;
  /** Draft reply text (may be auto-generated smart template) */
  draftReply: string;
  /** Whether this comment has been replied to */
  isReplied: boolean;
}

/**
 * Options for the usePRReview hook
 */
export interface UsePRReviewOptions {
  /** Owner of the GitHub repository */
  owner: string | (() => string);
  /** Repository name */
  repo: string | (() => string);
  /** PR number */
  prNumber: number | (() => number);
  /** Polling interval in milliseconds (default: 30000 for aggressive) */
  pollInterval?: number;
  /** Whether to start polling immediately (default: true) */
  autoStart?: boolean;
  /** Callback when new reviews are detected */
  onNewReviews?: (reviews: GitHubPRReview[]) => void;
  /** Callback when new comments are detected */
  onNewComments?: (comments: GitHubReviewComment[]) => void;
  /** Callback when review state changes */
  onStateChange?: (state: ReviewState) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

/**
 * Return type for the usePRReview hook
 */
export interface UsePRReviewReturn {
  /** Current reviews */
  reviews: () => GitHubPRReview[];
  /** Current comments with drafts */
  commentsWithDrafts: () => CommentWithDraft[];
  /** Overall review state */
  reviewState: () => ReviewState;
  /** Whether currently polling */
  isPolling: () => boolean;
  /** Last error */
  error: () => Error | null;
  /** Whether a submit is in progress */
  isSubmitting: () => boolean;

  /** Update draft reply for a specific comment */
  setDraftReply: (commentId: number, text: string) => void;
  /** Generate smart reply template for a comment */
  generateSmartReply: (comment: GitHubReviewComment) => string;
  /** Reply to a single comment without making code changes */
  replyOnly: (commentId: number) => Promise<void>;
  /** Reply to a comment and transition ticket to PLANNING for code changes */
  replyAndAddressChanges: (commentId: number) => Promise<void>;
  /** Address all pending comments with one combined commit approach */
  addressAllComments: () => Promise<void>;
  /** Manually refresh reviews and comments */
  refresh: () => Promise<void>;
  /** Start polling */
  startPolling: () => void;
  /** Stop polling */
  stopPolling: () => void;
}

/**
 * Dependencies for testing (dependency injection)
 */
export interface UsePRReviewDeps {
  listReviews: (owner: string, repo: string, prNumber: number) => Promise<GitHubPRReview[]>;
  listReviewComments: (
    owner: string,
    repo: string,
    prNumber: number,
  ) => Promise<GitHubReviewComment[]>;
  createReviewComment: (
    owner: string,
    repo: string,
    prNumber: number,
    body: string,
    inReplyTo?: number,
  ) => Promise<void>;
  createReview: (
    owner: string,
    repo: string,
    prNumber: number,
    params: { body: string; event: string },
  ) => Promise<void>;
  updateTicketStatus: (ticketId: string, status: string) => Promise<void>;
  logEvent: (type: string, payload: Record<string, unknown>) => void;
}
