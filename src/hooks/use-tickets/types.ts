/**
 * Type definitions for the useTickets hook
 */

import type { Accessor } from "solid-js";
import type { Ticket, TicketStatus } from "../../types/ticket.ts";
import type { AgentType } from "../../types/config.ts";

/** Rig can be a static string or a reactive Accessor */
export type RigOption = string | Accessor<string | undefined>;

/**
 * Options for the tickets hook
 */
export interface UseTicketsOptions {
  /** Filter tickets by rig (git remote URL) - can be static or reactive */
  rig?: RigOption;
  /** Whether to auto-load tickets on mount */
  autoLoad?: boolean;
  /** Poll interval in ms to refresh tickets (0 = no polling) */
  pollInterval?: number;
  /** Callback when tickets change */
  onChange?: (tickets: Ticket[]) => void;
}

/**
 * Input for creating a new ticket
 */
export interface CreateTicketInput {
  /** Jira ticket key (e.g., "AM-123") */
  jiraKey: string;
  /** Git rig identifier */
  rig: string;
  /** Jira URL */
  jiraUrl?: string;
  /** Ticket summary */
  summary?: string;
  /** Agent to use */
  agent?: AgentType;
}

/**
 * Input for updating a ticket
 */
export interface UpdateTicketInput {
  /** Ticket summary */
  summary?: string;
  /** Ticket status */
  status?: TicketStatus;
  /** Worktree path */
  worktreePath?: string;
  /** Branch name */
  branchName?: string;
  /** Agent type */
  agent?: AgentType;
  /** Agent process ID */
  agentPid?: number | null;
  /** PR URL */
  prUrl?: string | null;
}

/**
 * Return value from useTickets hook
 */
export interface UseTicketsReturn {
  /** Current list of tickets */
  tickets: Accessor<Ticket[]>;
  /** Loading state */
  isLoading: Accessor<boolean>;
  /** Last error if any */
  error: Accessor<Error | null>;
  /** Reload tickets from database */
  reload: () => void;
  /** Get a single ticket by ID */
  get: (id: string) => Ticket | null;
  /** Create a new ticket */
  create: (input: CreateTicketInput) => Ticket;
  /** Update a ticket */
  update: (id: string, input: UpdateTicketInput) => void;
  /** Update ticket status */
  setStatus: (id: string, status: TicketStatus) => void;
  /** Delete a ticket */
  remove: (id: string) => void;
  /** Find tickets by status */
  findByStatus: (status: TicketStatus) => Ticket[];
}

/** Resolve rig option to current value */
export function resolveRig(rig: RigOption | undefined): string | undefined {
  if (rig === undefined) return undefined;
  if (typeof rig === "function") return rig();
  return rig;
}
