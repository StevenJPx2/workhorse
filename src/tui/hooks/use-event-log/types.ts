import type { Accessor } from "solid-js";
import type { TicketEventType, TicketStatus } from "#types/ticket.ts";

export type EventLogAction =
  | TicketEventType
  | "agent_started"
  | "agent_stopped"
  | "agent_crashed"
  | "jira_sync"
  | "notification";

export interface EventLogEntry {
  id: number;
  ticketId: string;
  eventType: EventLogAction;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface LogStatusChangeParams {
  from: TicketStatus;
  to: TicketStatus;
}

export interface LogFileModifiedParams {
  path: string;
  additions: number;
  deletions: number;
}

export interface LogTestResultParams {
  passed: number;
  failed: number;
  total: number;
}

export interface LogAgentStartedParams {
  agent: string;
  worktreePath: string;
}

export interface LogCommentParams {
  source: "agent" | "jira" | "user" | "system";
  content: string;
}

export interface UseEventLogOptions {
  ticketId?: string | (() => string | undefined);
  autoLoad?: boolean;
  pollInterval?: number;
  maxEvents?: number;
}

export interface UseEventLogReturn {
  events: Accessor<EventLogEntry[]>;
  isLoading: Accessor<boolean>;
  error: Accessor<Error | null>;
  count: Accessor<number>;

  logStatusChange: (params: LogStatusChangeParams) => EventLogEntry;
  logFileModified: (params: LogFileModifiedParams) => EventLogEntry;
  logTestResult: (params: LogTestResultParams) => EventLogEntry;
  logAgentStarted: (params: LogAgentStartedParams) => EventLogEntry;
  logAgentStopped: (params: Record<string, unknown>) => EventLogEntry;
  logAgentCrashed: (params: Record<string, unknown>) => EventLogEntry;
  logComment: (params: LogCommentParams) => EventLogEntry;
  logEscalation: (questions: string[]) => EventLogEntry;
  logCustom: (type: EventLogAction, payload: Record<string, unknown>) => EventLogEntry;

  reload: () => void;
  getEventsByType: (type: EventLogAction) => EventLogEntry[];
  getRecentEvents: (count: number) => EventLogEntry[];
}
