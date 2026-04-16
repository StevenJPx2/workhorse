/**
 * Type definitions for SyncIndicator component
 */

/**
 * Props for the SyncIndicator component
 */
export interface SyncIndicatorProps {
  /** Whether to show GitHub sync status */
  showGitHub?: boolean;
  /** Whether to show Jira sync status */
  showJira?: boolean;
  /** Accessor for GitHub polling state */
  isGitHubPolling?: () => boolean;
  /** Accessor for Jira polling state */
  isJiraPolling?: () => boolean;
}
