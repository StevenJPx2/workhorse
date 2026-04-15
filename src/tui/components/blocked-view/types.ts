/**
 * Type definitions for BlockedView component
 */

import type { Notification } from "#core/notifications/types.ts";

/**
 * Escalation data extracted from notifications
 */
export interface EscalationData {
  /** Questions posted to Jira */
  questions: string[];
  /** When the escalation was posted */
  postedAt: string;
  /** Context provided with the escalation */
  context?: string;
  /** Source notification ID */
  notificationId: string;
}

/**
 * Props for the BlockedView component
 */
export interface BlockedViewProps {
  /** Ticket ID (e.g., "AM-123") */
  ticketId: string;
  /** Jira URL for the ticket */
  jiraUrl: string | null;
  /** Current blocking notifications */
  notifications: Notification[];
  /** Callback: Resume work (nudge agent to check responses) */
  onResume?: () => void;
  /** Callback: View ticket in Jira */
  onViewJira?: () => void;
  /** Callback: Cancel/close the ticket */
  onCancel?: () => void;
  /** Callback: Hand off to different agent */
  onHandoff?: () => void;
  /** Whether the resume action is in progress */
  isResuming?: boolean;
}

/**
 * Parse escalation data from a notification
 */
export function parseEscalationFromNotification(notification: Notification): EscalationData | null {
  if (notification.source_type !== "system" && notification.priority !== "blocking") {
    return null;
  }

  try {
    const metadata = notification.metadata ? JSON.parse(notification.metadata) : {};
    const questions = metadata.questions ?? [];

    return {
      questions: Array.isArray(questions) ? questions : [],
      postedAt: notification.created_at,
      context: metadata.context,
      notificationId: notification.id,
    };
  } catch {
    return {
      questions: [],
      postedAt: notification.created_at,
      notificationId: notification.id,
    };
  }
}

/**
 * Format relative time (e.g., "3 minutes ago")
 */
export function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
}
