/**
 * Types for the ticket agent workflow
 */

import type { Ticket, TicketStatus } from "#types/ticket.ts";
import type { AgentType } from "#types/config.ts";
import type { AgentInstance } from "../agent/orchestrator/types.ts";

/**
 * Options for launching a ticket agent
 */
export interface LaunchTicketAgentOptions {
  /** Ticket ID (must already exist in database) */
  ticketId: string;
  /** Agent type to spawn */
  agentType: AgentType;
  /** Issue type (Task, Bug, Story, etc.) */
  issueType: string;
  /** Issue summary/title */
  summary?: string;
  /** Issue description */
  description?: string;
  /** Jira issue URL */
  jiraUrl?: string;
  /** Jira cloud ID for MCP config */
  jiraCloudId?: string;
  /** Repository path for worktree creation */
  repoPath: string;
  /** Base branch for worktree (defaults to main/master) */
  baseBranch?: string;
}

/**
 * Result of a launch operation
 */
export interface LaunchResult {
  success: boolean;
  ticket: Ticket | null;
  instance?: AgentInstance;
  error?: string;
}

/**
 * Options for halting a ticket agent
 */
export interface HaltTicketAgentOptions {
  /** Whether to remove the worktree after stopping */
  removeWorktree?: boolean;
}

/**
 * Result of a halt operation
 */
export interface HaltResult {
  success: boolean;
  error?: string;
}

/**
 * Options for resuming all active tickets
 */
export interface ResumeAllOptions {
  /** Repository path */
  repoPath: string;
  /** Jira cloud ID for MCP config */
  jiraCloudId?: string;
}

/**
 * Database operations interface - for dependency injection
 *
 * This allows the workflow to be tested with in-memory databases
 */
export interface DatabaseOperations {
  /** Get ticket by ID */
  getTicketById: (ticketId: string) => Ticket | null;

  /** Get all tickets */
  getAllTickets: () => Ticket[];

  /** Update ticket status */
  updateTicketStatus: (ticketId: string, status: TicketStatus) => void;

  /** Update ticket fields */
  updateTicket: (ticketId: string, updates: Partial<Ticket>) => void;

  /** Insert a ticket event */
  insertTicketEvent: (event: { ticket_id: string; event_type: string; payload: object }) => void;
}

/**
 * Active statuses that indicate a ticket should have a running agent
 */
export const ACTIVE_TICKET_STATUSES: TicketStatus[] = ["planning", "implementing", "queued"];
