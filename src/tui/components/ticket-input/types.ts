/**
 * Type definitions for TicketInput component
 */

import type { Accessor } from "solid-js";
import type { AgentType } from "#types/config.ts";
import type { JiraIssue } from "#core/jira/index.ts";

/**
 * Props for the TicketInput dialog
 */
export interface TicketInputProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Called when dialog closes (cancel or success) */
  onClose: () => void;
  /** Called when ticket is successfully added */
  onSubmit: (ticketKey: string, agent: AgentType, jiraIssue: JiraIssue) => void;
  /** Function to fetch a Jira issue */
  fetchIssue: (ticketKey: string) => Promise<JiraIssue>;
  /** Default agent to pre-select */
  defaultAgent?: AgentType;
}

/**
 * Internal state for the ticket input form
 */
export interface TicketInputState {
  /** Raw input value (ticket key or URL) */
  input: string;
  /** Parsed ticket key */
  ticketKey: string;
  /** Selected agent */
  agent: AgentType;
  /** Whether currently fetching from Jira */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Fetched Jira issue (if successful) */
  jiraIssue: JiraIssue | null;
}

/**
 * Return value from useTicketInput hook
 */
export interface UseTicketInputReturn {
  /** Current input value */
  input: Accessor<string>;
  /** Set input value */
  setInput: (value: string) => void;
  /** Parsed ticket key */
  ticketKey: Accessor<string>;
  /** Selected agent */
  agent: Accessor<AgentType>;
  /** Set agent */
  setAgent: (agent: AgentType) => void;
  /** Whether currently loading */
  isLoading: Accessor<boolean>;
  /** Error message if any */
  error: Accessor<string | null>;
  /** Fetched Jira issue */
  jiraIssue: Accessor<JiraIssue | null>;
  /** Submit the form */
  submit: () => Promise<void>;
  /** Reset the form */
  reset: () => void;
  /** Whether form is valid for submission */
  isValid: Accessor<boolean>;
}
