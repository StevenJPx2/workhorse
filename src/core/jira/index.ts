/**
 * Jira module - Core Jira integration with no UI dependencies
 */

// Client
export { AtlassianClient, createAtlassianClient } from "./client.ts";

// Mapping
export { mapIssueResponse } from "./map-issue.ts";

// Types
export type {
  JiraIssue,
  GetJiraIssueResponse,
  McpToolResultContent,
  AtlassianClientOptions,
  JiraClient,
} from "./types.ts";

// Sync operations
export {
  STATUS_TRANSITION_MAP,
  getTransitionId,
  formatPRComment,
  formatSyncSuccessMessage,
  formatSyncFailureMessage,
  type JiraSyncAction,
} from "./sync.ts";
