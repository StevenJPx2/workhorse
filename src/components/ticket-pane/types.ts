/**
 * Type definitions for TicketPane component
 */

import type { Ticket, TicketEvent, TicketStatus } from "../../types/ticket.ts";
import type { AgentType } from "../../types/config.ts";
import type { AgentState } from "../../harness/orchestrator/types.ts";
import type { EventLogEntry } from "../../hooks/use-event-log/types.ts";

/**
 * Props for the TicketPane component
 */
export interface TicketPaneProps {
  /** The ticket to display */
  ticket: Ticket;
  /** Agent state (idle, running, etc.) - can be value or accessor for reactivity */
  agentState?: AgentState | (() => AgentState | undefined);
  /** Events/progress log for this ticket */
  events?: TicketEvent[];
  /** Event log entries from useEventLog (takes precedence over events) */
  logEntries?: EventLogEntry[];
}

/**
 * Props for the TicketHeader sub-component
 */
export interface TicketHeaderProps {
  /** Ticket ID (e.g., "AM-123") */
  id: string;
  /** Ticket summary/title */
  summary: string | null;
}

/**
 * Props for the TicketMeta sub-component
 */
export interface TicketMetaProps {
  /** Current ticket status */
  status: TicketStatus;
  /** Agent type */
  agent: AgentType;
  /** Agent state (idle, running, etc.) - can be value or accessor for reactivity */
  agentState?: AgentState | (() => AgentState | undefined);
  /** Worktree path (if created) */
  worktreePath: string | null;
  /** Branch name */
  branchName: string | null;
}

/**
 * Props for the ProgressLog sub-component
 */
export interface ProgressLogProps {
  /** Events to display (raw DB format) */
  events?: TicketEvent[];
  /** Event log entries from useEventLog (takes precedence if provided) */
  logEntries?: EventLogEntry[];
  /** Max events to show (default: 10) */
  maxEvents?: number;
  /** Whether to show timestamps */
  showTimestamps?: boolean;
}

/**
 * Props for the TicketActions sub-component
 */
export interface TicketActionsProps {
  /** Called when user requests to switch agent */
  onSwitchAgent?: () => void;
  /** Current agent state to determine which actions to show */
  agentState?: AgentState | (() => AgentState | undefined);
}

/**
 * Formatted event for display
 */
export interface FormattedEvent {
  /** Display icon */
  icon: string;
  /** Event description */
  description: string;
  /** Timestamp */
  timestamp: string;
  /** Whether this is the current/active event */
  isCurrent: boolean;
}
