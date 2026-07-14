/**
 * GitHub domain types for the GitHub plugin.
 * These represent the raw data structures from the GitHub API.
 */

/** GitHub issue from API */
export interface GitHubIssue {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  assignee: { login: string } | null;
  labels: Array<{ name: string }>;
  pull_request?: { url: string }; // Present if this is a PR
  created_at: string;
  updated_at: string;
}

/** GitHub PR from API */
export interface GitHubPR extends GitHubIssue {
  head: { ref: string; sha: string };
  base: { ref: string };
  mergeable: boolean | null;
  mergeable_state: string;
  merged: boolean;
  merged_at: string | null;
  merged_by: { login: string } | null;
  draft: boolean;
  additions: number;
  deletions: number;
  changed_files: number;
}

/** GitHub PR review */
export interface GitHubReview {
  id: number;
  user: { login: string };
  state:
    "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";
  body: string;
  submitted_at: string;
}

/** GitHub comment (issue or review) */
export interface GitHubComment {
  id: number;
  user: { login: string };
  body: string;
  created_at: string;
  // Review comment specific
  path?: string;
  line?: number;
  diff_hunk?: string;
}

/** Options for creating a PR */
export interface CreatePROptions {
  owner: string;
  repo: string;
  head: string; // Branch name
  base: string; // Target branch
  title: string;
  body?: string;
  draft?: boolean;
}

/** GitHub check run (CI/CD status) */
export interface GitHubCheckRun {
  id: number;
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion:
    | "success"
    | "failure"
    | "neutral"
    | "cancelled"
    | "skipped"
    | "timed_out"
    | "action_required"
    | null;
  html_url: string;
  started_at: string | null;
  completed_at: string | null;
}

/** Parsed GitHub reference (owner/repo#number or URL) */
export interface GitHubRef {
  owner: string;
  repo: string;
  number: number;
  type: "issue" | "pull";
}

/** State tracked by the PR monitor between polls */
export interface GitHubPRMonitorState {
  lastSeenReviewIds: number[];
  lastSeenCommentIds: number[];
  lastCheckConclusions: Record<string, string>; // checkName -> conclusion
  lastMergeableState: string;
  lastMerged: boolean;
  lastClosed: boolean;
}

/** PR status summary returned by github_get_pr_status tool */
export interface PRStatusSummary {
  state: "open" | "closed" | "merged";
  draft: boolean;
  mergeable: boolean | null;
  mergeableState: string;
  reviews: {
    approved: number;
    changesRequested: number;
    commented: number;
    pending: number;
  };
  checks: {
    total: number;
    passing: number;
    failing: number;
    pending: number;
  };
  additions: number;
  deletions: number;
  changedFiles: number;
}

/** A single inline comment from a review */
export interface ReviewComment {
  path: string;
  line: number | null;
  diffHunk: string | null;
  body: string;
}

/** A detailed review with its inline comments */
export interface DetailedReview {
  id: number;
  author: string;
  state: GitHubReview["state"];
  body: string;
  submittedAt: string;
  comments: ReviewComment[];
}

/** A general PR conversation comment (not part of a review) */
export interface ConversationComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  /** Number of images embedded in comment (only present if > 0) */
  imageCount?: number;
}

/** Attachment/image reference extracted from GitHub markdown */
export interface GitHubAttachment {
  /** Unique identifier (hash of URL) */
  id: string;
  /** Original URL of the image */
  url: string;
  /** Alt text from markdown if present */
  alt?: string;
  /** Source location: "body", "comment-{id}" */
  source: string;
  /** Detected MIME type based on URL */
  mimeType: string;
  /** Original filename from URL */
  filename: string;
}

/** Result returned by the github_get_pr_reviews tool */
export interface PRReviewsResult {
  totalReviews: number;
  totalConversationComments: number;
  summary: {
    approved: number;
    changesRequested: number;
    commented: number;
    dismissed: number;
    pending: number;
  };
  reviews: DetailedReview[];
  conversationComments: ConversationComment[];
}
