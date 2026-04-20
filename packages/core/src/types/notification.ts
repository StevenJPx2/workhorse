export type NotificationPriority = "blocking" | "high" | "normal" | "low";

export type NotificationStatus = "unread" | "read" | "acknowledged";

export interface Notification {
  id: string;
  issueId: string;
  source: string;
  sourceId?: string;
  priority: NotificationPriority;
  status: NotificationStatus;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  readAt?: Date;
  acknowledgedAt?: Date;
}
