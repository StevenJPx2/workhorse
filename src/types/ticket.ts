/**
 * Ticket types for Jiratown
 */

import type { AgentType } from "./config.ts";

export type TicketStatus =
  | "pending"
  | "queued"
  | "planning"
  | "implementing"
  | "blocked"
  | "pr_created"
  | "in_review"
  | "done";

export interface Ticket {
  id: string; // "AM-123"
  jira_key: string;
  jira_url: string | null;
  summary: string | null;
  status: TicketStatus;

  // Worktree integration
  rig: string; // Git remote URL (e.g., "github.com/user/repo")
  worktree_path: string | null;
  branch_name: string | null;

  // Agent config
  agent: AgentType;
  agent_pid: number | null;

  // PR tracking
  pr_url: string | null;
  pr_number: number | null;

  // Timestamps
  created_at: string;
  updated_at: string;

  // Jira sync state
  last_jira_sync: string | null;
}

export type TicketEventType =
  | "status_change"
  | "file_modified"
  | "test_result"
  | "escalation"
  | "comment";

export interface TicketEvent {
  id: number;
  ticket_id: string;
  event_type: TicketEventType;
  payload: string; // JSON blob
  timestamp: string;
}

/**
 * Parsed ticket event payload types
 */
export interface StatusChangePayload {
  from: TicketStatus;
  to: TicketStatus;
}

export interface FileModifiedPayload {
  path: string;
  additions: number;
  deletions: number;
}

export interface TestResultPayload {
  passed: number;
  failed: number;
  total: number;
}

export interface EscalationPayload {
  questions: string[];
  jira_comment_id?: string;
}

export interface CommentPayload {
  source: "agent" | "jira" | "user";
  content: string;
}
