/**
 * Jira types - Core data structures with no UI dependencies
 */

/**
 * Jira issue data returned from the Atlassian MCP
 */
export interface JiraIssue {
  /** Issue key (e.g., "AM-123") */
  key: string;
  /** Issue summary/title */
  summary: string;
  /** Issue description (may contain markdown/rich text) */
  description: string | null;
  /** Current status name */
  status: string;
  /** Priority name */
  priority: string | null;
  /** Assignee display name */
  assignee: string | null;
  /** Reporter display name */
  reporter: string | null;
  /** Issue type (e.g., "Bug", "Story", "Task") */
  issueType: string;
  /** Full URL to the issue in Jira */
  url: string;
  /** Project key */
  projectKey: string;
  /** Created timestamp */
  created: string;
  /** Updated timestamp */
  updated: string;
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

/**
 * Options for creating an Atlassian client
 */
export interface AtlassianClientOptions {
  /** Jira cloud ID (e.g., "yourcompany.atlassian.net") */
  cloudId: string;
}

/**
 * User info returned from Atlassian
 */
export interface AtlassianUserInfo {
  /** User's Atlassian account ID */
  accountId: string;
  /** User's display name */
  displayName: string;
}

/**
 * Interface for Jira client operations
 *
 * This allows dependency injection for testing
 */
export interface JiraClient {
  /** Whether connected to the MCP server */
  readonly isConnected: boolean;

  /** Connect to the Atlassian MCP server */
  connect(): Promise<void>;

  /** Disconnect from the Atlassian MCP server */
  disconnect(): Promise<void>;

  /** Fetch a Jira issue by key */
  fetchIssue(ticketKey: string): Promise<JiraIssue>;

  /** Add a comment to a Jira issue */
  addComment(ticketKey: string, body: string): Promise<void>;

  /** Transition a Jira issue to a new status */
  transitionIssue(ticketKey: string, transitionId: string): Promise<void>;

  /** Get the current authenticated user's info */
  getCurrentUser(): Promise<AtlassianUserInfo>;

  /** Edit a Jira issue (update fields) */
  editIssue(ticketKey: string, fields: Record<string, unknown>): Promise<void>;

  /** Assign a Jira issue to a user */
  assignIssue(ticketKey: string, accountId: string): Promise<void>;
}
