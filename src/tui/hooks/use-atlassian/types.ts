/**
 * Type definitions for the useAtlassian hook
 */

import type { Accessor } from "solid-js";
import type { JiraIssue, AtlassianUserInfo } from "#core/jira/index.ts";

// Re-export types from core for backward compatibility
export type { JiraIssue, AtlassianUserInfo };

/**
 * Cloud ID can be a static string or a reactive getter function.
 * Using a getter allows the cloudId to be resolved lazily after config loads.
 */
export type CloudIdOption = string | (() => string | undefined);

/**
 * Options for the useAtlassian hook
 */
export interface UseAtlassianOptions {
  /**
   * Jira cloud ID (e.g., "yourcompany.atlassian.net").
   * Can be a string or a getter function for reactive resolution.
   */
  cloudId?: CloudIdOption;
  /** Whether to auto-connect on mount */
  autoConnect?: boolean;
  /** Callback when connection status changes */
  onConnectionChange?: (connected: boolean) => void;
  /** Callback when error occurs */
  onError?: (error: Error) => void;
}

/**
 * Return value from useAtlassian hook
 */
export interface UseAtlassianReturn {
  /** Whether connected to Atlassian MCP */
  isConnected: Accessor<boolean>;
  /** Whether currently connecting */
  isConnecting: Accessor<boolean>;
  /** Last error if any */
  error: Accessor<Error | null>;
  /** Connect to Atlassian MCP */
  connect: () => Promise<void>;
  /** Disconnect from Atlassian MCP */
  disconnect: () => Promise<void>;
  /** Fetch a Jira issue by key */
  fetchIssue: (ticketKey: string) => Promise<JiraIssue>;
  /** Add a comment to a Jira issue */
  addComment: (ticketKey: string, body: string) => Promise<void>;
  /** Transition a Jira issue to a new status */
  transitionIssue: (ticketKey: string, transitionId: string) => Promise<void>;
  /** Get the current authenticated user's info */
  getCurrentUser: () => Promise<AtlassianUserInfo>;
  /** Edit a Jira issue (update fields) */
  editIssue: (ticketKey: string, fields: Record<string, unknown>) => Promise<void>;
  /** Assign a Jira issue to a user */
  assignIssue: (ticketKey: string, accountId: string) => Promise<void>;
}

/**
 * Raw response from getJiraIssue MCP tool
 */
export interface GetJiraIssueResponse {
  key: string;
  fields: {
    summary: string;
    description?: string | null;
    status: { name: string };
    priority?: { name: string } | null;
    assignee?: { displayName: string } | null;
    reporter?: { displayName: string } | null;
    issuetype: { name: string };
    project: { key: string };
    created: string;
    updated: string;
  };
  self: string;
}

/**
 * MCP tool call result content item
 */
export interface McpToolResultContent {
  type: "text";
  text: string;
}
