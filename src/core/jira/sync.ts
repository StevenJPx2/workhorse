/**
 * Jira sync operations
 *
 * Pure functions for syncing ticket status with Jira.
 */

/**
 * Map of internal status names to Jira transition IDs
 */
export const STATUS_TRANSITION_MAP: Record<string, string> = {
  pending: "11",
  queued: "21",
  planning: "31",
  implementing: "41",
  blocked: "61",
  pr_created: "71",
  in_review: "81",
  done: "91",
};

/**
 * Get the Jira transition ID for a given status
 */
export function getTransitionId(status: string): string | undefined {
  return STATUS_TRANSITION_MAP[status];
}

/**
 * Valid Jira sync actions
 */
export type JiraSyncAction = "comment" | "transition" | "link_pr";

/**
 * Format a PR link comment
 */
export function formatPRComment(prUrl: string): string {
  return `Pull Request: ${prUrl}`;
}

/**
 * Format a sync success event message
 */
export function formatSyncSuccessMessage(action: JiraSyncAction, timestamp: string): string {
  return `[jira-sync:${action}] Success at ${timestamp}`;
}

/**
 * Format a sync failure event message
 */
export function formatSyncFailureMessage(action: JiraSyncAction, error: string): string {
  return `[jira-sync:${action}] Failed: ${error}`;
}
