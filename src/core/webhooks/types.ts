/**
 * Webhook system types
 */

export type WebhookSource = "github" | "jira";

export type WebhookEventType =
  // GitHub events
  | "github.pull_request_review"
  | "github.pull_request_review_comment"
  | "github.issue_comment"
  // Jira events
  | "jira.comment_created"
  | "jira.comment_updated"
  | "jira.issue_updated";

/**
 * Parsed webhook event (normalized from raw payload)
 */
export interface WebhookEvent {
  source: WebhookSource;
  eventType: WebhookEventType;
  /** Ticket ID this event relates to (e.g., "AM-123") */
  ticketId: string | null;
  /** PR number for GitHub events */
  prNumber?: number;
  /** Raw event payload */
  payload: unknown;
  /** Timestamp when event was received */
  receivedAt: string;
}

/**
 * Result of processing a webhook
 */
export interface WebhookResult {
  success: boolean;
  /** Event that was processed */
  event?: WebhookEvent;
  /** Notification IDs created */
  notificationIds?: string[];
  /** Error message if failed */
  error?: string;
}

/**
 * Webhook handler function signature
 */
export type WebhookHandler = (
  payload: unknown,
  headers: Record<string, string>,
) => Promise<WebhookResult>;

/**
 * Configuration for webhook server
 */
export interface WebhookServerConfig {
  /** Port to listen on */
  port: number;
  /** Host to bind to (default: "localhost") */
  host?: string;
  /** Callback when webhook is processed */
  onWebhookReceived?: (event: WebhookEvent) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

/**
 * Webhook server instance
 */
export interface WebhookServer {
  /** Start the webhook server */
  start: () => Promise<void>;
  /** Stop the webhook server */
  stop: () => Promise<void>;
  /** Check if server is running */
  isRunning: () => boolean;
  /** Get the server URL */
  getUrl: () => string | null;
}

/**
 * GitHub webhook payload types
 */
export interface GitHubWebhookReviewPayload {
  action: "submitted" | "edited" | "dismissed";
  review: {
    id: number;
    user: { login: string };
    body: string | null;
    state: "approved" | "changes_requested" | "commented";
    submitted_at: string;
  };
  pull_request: {
    number: number;
    title: string;
    html_url: string;
  };
  repository: {
    full_name: string;
  };
}

export interface GitHubWebhookReviewCommentPayload {
  action: "created" | "edited" | "deleted";
  comment: {
    id: number;
    user: { login: string };
    body: string;
    path: string;
    line: number | null;
    created_at: string;
    updated_at: string;
  };
  pull_request: {
    number: number;
    title: string;
  };
  repository: {
    full_name: string;
  };
}

export interface GitHubWebhookIssueCommentPayload {
  action: "created" | "edited" | "deleted";
  issue: {
    number: number;
    title: string;
    pull_request?: { url: string };
  };
  comment: {
    id: number;
    user: { login: string };
    body: string;
    created_at: string;
    updated_at: string;
  };
  repository: {
    full_name: string;
  };
}

/**
 * Jira webhook payload types
 */
export interface JiraWebhookPayload {
  webhookEvent: "comment_created" | "comment_updated" | "jira:issue_updated" | string;
  issue: {
    key: string;
    fields: {
      summary: string;
    };
  };
  comment?: {
    id: string;
    author: {
      displayName: string;
      accountId: string;
    };
    body: string;
    created: string;
    updated: string;
  };
  user?: {
    displayName: string;
    accountId: string;
  };
  timestamp: number;
}
