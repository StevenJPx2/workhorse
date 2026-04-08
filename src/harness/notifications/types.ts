/**
 * Notification types for agent communication
 */

export type NotificationPriority = "blocking" | "high" | "normal" | "low";

export type NotificationSourceType =
  | "github_pr_review"
  | "github_pr_comment"
  | "jira_comment"
  | "system";

export type NotificationStatus = "unread" | "read" | "acknowledged";

/**
 * Notification stored in database
 */
export interface Notification {
  id: string;
  ticket_id: string;

  // Source identification (for deduplication)
  source_type: NotificationSourceType;
  source_id: string;

  // Content
  priority: NotificationPriority;
  summary: string;
  content: string;
  author: string | null;
  metadata: string | null; // JSON blob

  // State
  status: NotificationStatus;
  read_at: string | null;
  acknowledged_at: string | null;

  // Timestamps
  created_at: string;
  source_timestamp: string | null;
}

/**
 * Input for creating a new notification
 */
export interface CreateNotificationInput {
  ticket_id: string;
  source_type: NotificationSourceType;
  source_id: string;
  priority: NotificationPriority;
  summary: string;
  content: string;
  author?: string;
  metadata?: Record<string, unknown>;
  source_timestamp?: string;
}

/**
 * Filters for querying notifications
 */
export interface NotificationFilters {
  ticket_id?: string;
  status?: NotificationStatus | NotificationStatus[];
  priority?: NotificationPriority | NotificationPriority[];
  source_type?: NotificationSourceType | NotificationSourceType[];
}
