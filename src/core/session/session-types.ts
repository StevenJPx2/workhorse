/**
 * Session Memory Types
 */

export interface SessionEvent {
  timestamp: string;
  type:
    | "status_change"
    | "file_modified"
    | "test_result"
    | "escalation"
    | "agent_message"
    | "user_message";
  description: string;
  metadata?: Record<string, unknown>;
}

export interface SessionMemory {
  ticketId: string;
  status: string;
  agent: string;
  branch: string;
  startedAt: string;
  lastUpdatedAt: string;
  summary: string;
  recentActivity: SessionEvent[];
  keyDecisions: string[];
}

export const JIRATOWN_DIR = ".jiratown";
export const CONTEXT_FILE = "context.md";
export const MAX_EVENTS = 20;
