/**
 * Jira domain types for the Jira plugin.
 *
 * @module workhorse-plugin-jira/types
 */

/** Fields object from Jira REST API response */
export interface JiraFields extends Record<string, unknown> {
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
  attachment?: JiraAttachment[];
  created?: string;
  updated?: string;
}

/** Jira issue as returned by the REST API */
export interface JiraIssue {
  key: string;
  self: string;
  fields: JiraFields;
}

/** Jira attachment as returned by the REST API */
export interface JiraAttachment {
  /** Attachment ID */
  id: string;
  /** Original filename */
  filename: string;
  /** MIME type (e.g., "image/png", "application/pdf") */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** URL to download the attachment content (requires auth) */
  content: string;
  /** ISO timestamp of when the attachment was created */
  created: string;
  /** Author of the attachment */
  author: {
    displayName: string;
    accountId: string;
  };
  /** Thumbnail URL (images only) */
  thumbnail?: string;
}

/** Jira comment */
export interface JiraComment {
  id: string;
  author: {
    displayName: string;
    accountId: string;
  };
  /** Comment body — ADF object when using REST API v3 */
  body: unknown;
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

/** Auth credentials for Jira REST API (API Token auth) */
export interface JiraCredentials {
  /** User's Atlassian account email */
  email: string;
  /** API token from https://id.atlassian.com/manage-profile/security/api-tokens */
  apiToken: string;
  /** Atlassian site URL (e.g., "yoursite.atlassian.net") */
  siteUrl: string;
}
