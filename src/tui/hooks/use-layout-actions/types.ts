/**
 * Type definitions for useLayoutActions hook
 */

import type { Accessor } from "solid-js";

/**
 * Options for useLayoutActions hook
 */
export interface UseLayoutActionsOptions {
  /** Getter for current ticket ID */
  currentTicketId: Accessor<string | undefined>;
  /** Callback to reload tickets */
  reloadTickets: () => void;
  /** Quit callback from renderer */
  onQuit: () => void | Promise<void>;
}

/**
 * Return value from useLayoutActions hook
 */
export interface UseLayoutActionsReturn {
  /** Quit the application (stops all agents) */
  quit: () => Promise<void>;
  /** Open the add ticket modal */
  addTicket: () => void;
  /** Close the current ticket */
  closeTicket: () => void;
  /** Open current ticket in Jira */
  openInJira: () => void;
  /** Escalate current ticket (ask questions) */
  escalate: () => void;
  /** Switch agent type for current ticket */
  switchAgent: () => void;
  /** Toggle agent running state for current ticket */
  toggleAgent: () => Promise<void>;
  /** Start agent for current ticket if not already running */
  startAgent: () => Promise<void>;
  /** Whether an agent is currently starting */
  isAgentStarting: Accessor<boolean>;
  /** Get agent state, accounting for starting state */
  getAgentState: (ticketId: string) => string | undefined;
}
