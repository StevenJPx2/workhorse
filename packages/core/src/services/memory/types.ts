import type { IssueStatus, NotificationPriority } from "#db";

/**
 * Parsed representation of a worktree's context.md file.
 * Contains patterns learned about the codebase and session history.
 */
export interface SessionMemory {
  /** Issue title (e.g., "AM-123: Add priority field to tasks") */
  title: string;
  /** Codebase patterns discovered during work */
  patterns: string[];
  /** Chronological list of work sessions */
  sessions: SessionEntry[];
  /** Status from the most recent session */
  latestStatus: IssueStatus;
}

/**
 * A single work session entry in context.md.
 * Each agent session appends one of these.
 */
export interface SessionEntry {
  /** When this session occurred */
  timestamp: Date;
  /** Issue status at end of session */
  status: IssueStatus;
  /** Summary bullet points of work done */
  summary: string[];
  /** Learnings discovered during this session */
  learnings: string[];
  /** Files that were modified */
  filesChanged: string[];
}

/**
 * Result from a memory search query.
 */
export interface SearchResult {
  /** Document ID */
  id: string;
  /** Relevance score (higher = more relevant) */
  score: number;
  /** Document content (if returnContent was true) */
  content?: string;
  /** Document metadata */
  metadata?: Record<string, unknown>;
}

/**
 * A document to be indexed in the L2 memory store.
 */
export interface MemoryDocument {
  /** Unique document ID */
  id: string;
  /** Document content to index */
  content: string;
  /** Document metadata for filtering */
  metadata: {
    /** Associated issue ID */
    issueId?: string;
    /** Document type for categorization */
    type: MemoryDocumentType;
    /** Source of the document */
    source?: string;
    /** Additional metadata */
    [key: string]: unknown;
  };
}

/**
 * Types of documents stored in L2 memory.
 */
export type MemoryDocumentType =
  | "session_memory"
  | "issue_context"
  | "pr_context"
  | "decision"
  | "code_context"
  | (string & {});

/**
 * Options for searching the L2 memory store.
 */
export interface MemorySearchOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Filter by metadata fields */
  filter?: {
    issueId?: string;
    type?: MemoryDocumentType;
    source?: string;
    [key: string]: unknown;
  };
  /** Whether to include document content in results */
  returnContent?: boolean;
}

/**
 * Types of events that can be emitted for an issue.
 * Used for tracking issue activity and history.
 */
export type IssueEventType =
  | "status_changed"
  | "comment_added"
  | "pr_created"
  | "pr_merged"
  | "pr_closed"
  | "review_requested"
  | "review_submitted"
  | "blocked"
  | "unblocked"
  | "assigned"
  | "work_started"
  | "work_completed"
  | "error"
  | "info";

/**
 * Input for creating a new notification.
 */
export interface CreateNotificationInput {
  /** Issue this notification is for */
  issueId: string;
  /** Source of the notification (e.g., "jira", "github", "system") */
  source: string;
  /** Source-specific ID for deduplication */
  sourceId?: string;
  /** Notification priority */
  priority?: NotificationPriority;
  /** Notification title */
  title: string;
  /** Notification body/content */
  body: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}
