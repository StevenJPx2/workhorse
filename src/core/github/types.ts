/**
 * GitHub PR context types
 */

/**
 * PR review from GitHub
 */
export interface PRReview {
  id: number;
  user: string;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING" | "DISMISSED";
  body: string | null;
  submittedAt: string;
}

/**
 * PR comment from GitHub
 */
export interface PRComment {
  id: number;
  user: string;
  body: string;
  path?: string;
  line?: number;
  createdAt: string;
}

/**
 * PR check status
 */
export interface PRCheck {
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "neutral" | "cancelled" | "skipped" | "timed_out" | null;
}

/**
 * Complete PR context for resume
 */
export interface PRContext {
  /** PR number */
  number: number;
  /** PR title */
  title: string;
  /** PR state (open, closed, merged) */
  state: "open" | "closed" | "merged";
  /** Whether the PR is mergeable */
  mergeable: boolean | null;
  /** Number of commits */
  commits: number;
  /** Number of changed files */
  changedFiles: number;
  /** Additions count */
  additions: number;
  /** Deletions count */
  deletions: number;
  /** Reviews on the PR */
  reviews: PRReview[];
  /** Comments on the PR (review comments, not issue comments) */
  comments: PRComment[];
  /** Check runs status */
  checks: PRCheck[];
  /** Overall review decision */
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  /** Latest commit SHA */
  headSha: string;
  /** Timestamp when fetched */
  fetchedAt: string;
}
