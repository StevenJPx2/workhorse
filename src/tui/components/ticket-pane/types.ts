/**
 * Type definitions for TicketPane component
 */

import type { Ticket, TicketEvent, TicketStatus } from "#types/ticket.ts";
import type { AgentType } from "#types/config.ts";
import type { AgentState } from "#core/agent/orchestrator/types.ts";
import type { Notification } from "#core/notifications/types.ts";
import type { EventLogEntry } from "../../hooks/use-event-log/types.ts";
import type { UsePRReviewReturn } from "../../hooks/use-pr-review/types.ts";

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
  /** PR review hook return (shown when ticket is in_review with pr_url) */
  prReview?: UsePRReviewReturn;
  /** Blocking notifications (shown when ticket is blocked) */
  blockingNotifications?: Notification[];
  /** Accessor for Jira sync in progress state */
  isJiraSyncing?: () => boolean;
  /** Called when user wants to resume work (check for responses) */
  onResume?: () => void;
  /** Called when user wants to view ticket in Jira */
  onViewJira?: () => void;
  /** Called when user wants to cancel the ticket */
  onCancel?: () => void;
  /** Called when user wants to hand off to different agent */
  onHandoff?: () => void;
}

/**
 * Props for the TicketHeader sub-component
 */
export interface TicketHeaderProps {
  /** Ticket ID (e.g., "AM-123") */
  id: string;
  /** Ticket summary/title */
  summary: string | null;
  /** Whether to show GitHub sync indicator */
  showGitHub?: boolean;
  /** Whether to show Jira sync indicator */
  showJira?: boolean;
  /** Accessor for GitHub polling state */
  isGitHubPolling?: () => boolean;
  /** Accessor for Jira polling state */
  isJiraPolling?: () => boolean;
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
