/**
 * Types for useTicketWorkflow hook
 */

import type { Accessor } from "solid-js";
import type { Ticket } from "../../types/ticket.ts";
import type { AgentType } from "../../types/config.ts";
import type { JiraIssue } from "../use-atlassian/types.ts";
import type { AgentState } from "../../harness/orchestrator/types.ts";

/**
 * Options for useTicketWorkflow hook
 */
export interface UseTicketWorkflowOptions {
  /** Repository path for worktree operations (can be a getter for lazy resolution) */
  repoPath?: string | (() => string | undefined);
  /** Jira cloud ID (can be a getter for lazy resolution) */
  jiraCloudId?: string | (() => string | undefined);
  /** Callback when agent state changes */
  onAgentStateChange?: (ticketId: string, state: AgentState) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

/**
 * Options for starting work on a ticket
 */
export interface StartWorkOptions {
  /** ID of the ticket (already created in database) */
  ticketId: string;
  /** Agent type to spawn */
  agent: AgentType;
  /** Jira issue data */
  jiraIssue: JiraIssue;
}

/**
 * Return value from useTicketWorkflow hook
 */
export interface UseTicketWorkflowReturn {
  /** Loading state */
  isLoading: Accessor<boolean>;
  /** Last error if any */
  error: Accessor<Error | null>;
  /** Start work on a ticket (creates ticket, worktree, spawns agent) */
  startWork: (options: StartWorkOptions) => Promise<Ticket | null>;
  /** Stop work on a ticket (stops agent, optionally removes worktree) */
  stopWork: (ticketId: string, removeWorktree?: boolean) => Promise<boolean>;
  /** Get agent state for a ticket */
  getAgentState: (ticketId: string) => AgentState | undefined;
  /** Check if agent is running for a ticket */
  isAgentRunning: (ticketId: string) => boolean;
  /** Send message to agent */
  sendToAgent: (ticketId: string, message: string) => Promise<boolean>;
}
