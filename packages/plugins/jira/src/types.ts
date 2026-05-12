/**
 * Jira domain types for the Jira plugin.
 *
 * @module @jiratown/plugin-jira/types
 */

/** Jira issue as returned by the REST API */
export interface JiraIssue {
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: string;
    status: {
      name: string;
      id: string;
    };
    priority?: {
      name: string;
      id: string;
    };
    assignee?: {
      displayName: string;
      accountId: string;
    } | null;
    reporter?: {
      displayName: string;
      accountId: string;
    };
    issuetype?: {
      name: string;
    };
    labels?: string[];
    comment?: {
      comments: JiraComment[];
      total: number;
    };
    created?: string;
    updated?: string;
  };
}

/** Jira comment */
export interface JiraComment {
  id: string;
  author: {
    displayName: string;
    accountId: string;
  };
  body: string;
  created: string;
  updated: string;
  /** Parent comment ID if this is a reply */
  parentId?: string;
}

/** Jira workflow transition */
export interface JiraTransition {
  id: string;
  name: string;
  to: {
    name: string;
    id: string;
  };
}

/** Auth credentials for Jira REST API */
export interface JiraCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}
