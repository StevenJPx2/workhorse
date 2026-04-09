/**
 * Type definitions for TicketPane component
 */

import type { Ticket, TicketEvent, TicketStatus } from "../../types/ticket.ts";
import type { AgentType } from "../../types/config.ts";
import type { AgentState } from "../../harness/orchestrator/types.ts";

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
  /** Called when user requests escalation */
  onEscalate?: () => void;
  /** Called when user requests to switch agent */
  onSwitchAgent?: (agent: AgentType) => void;
  /** Called when user wants to open Jira */
  onOpenJira?: () => void;
  /** Called when user closes the ticket tab */
  onClose?: () => void;
  /** Called when user sends a message to the agent */
  onSendMessage?: (message: string) => void;
  /** Called when user clicks Stop agent */
  onStop?: () => void;
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
  /** Events to display */
  events: TicketEvent[];
  /** Max events to show (default: 10) */
  maxEvents?: number;
}

/**
 * Props for the TicketActions sub-component
 */
export interface TicketActionsProps {
  /** Called when user requests escalation */
  onEscalate?: () => void;
  /** Called when user requests to switch agent */
  onSwitchAgent?: () => void;
  /** Called when user wants to open Jira */
  onOpenJira?: () => void;
  /** Called when user closes the ticket */
  onClose?: () => void;
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
