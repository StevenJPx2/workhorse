/**
 * Types for background pollers
 */

/**
 * Poller state
 */
export type PollerState = "idle" | "running" | "stopped" | "error";

/**
 * Generic poll result
 */
export interface PollResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

/**
 * Base poller options
 */
export interface BasePollerOptions {
  /** Polling interval in milliseconds */
  interval: number;
  /** Whether to start polling immediately */
  autoStart?: boolean;
  /** Callback on error */
  onError?: (error: Error) => void;
}

/**
 * Jira comment from API
 */
export interface JiraComment {
  id: string;
  author: string;
  body: string;
  created: string;
  updated: string;
}

/**
 * Jira poll result
 */
export interface JiraPollResult {
  ticketId: string;
  comments: JiraComment[];
  newComments: JiraComment[];
}

/**
 * GitHub review from API
 */
export interface GitHubReview {
  id: number;
  user: string;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING";
  body: string;
  submittedAt: string;
}

/**
 * GitHub comment from API
 */
export interface GitHubComment {
  id: number;
  user: string;
  body: string;
  path?: string;
  line?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * GitHub poll result
 */
export interface GitHubPollResult {
  ticketId: string;
  prNumber: number;
  reviews: GitHubReview[];
  comments: GitHubComment[];
  newReviews: GitHubReview[];
  newComments: GitHubComment[];
}

/**
 * Agent health poll result
 */
export interface AgentPollResult {
  ticketId: string;
  healthy: boolean;
  sessionExists: boolean;
  lastOutput?: string;
}

/**
 * Poller interface
 */
export interface Poller<T> {
  /** Current state */
  state: PollerState;
  /** Start polling */
  start: () => void;
  /** Stop polling */
  stop: () => void;
  /** Poll immediately */
  poll: () => Promise<PollResult<T>>;
  /** Get last result */
  lastResult: () => PollResult<T> | null;
}
