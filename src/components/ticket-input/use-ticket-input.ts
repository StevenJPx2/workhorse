/**
 * useTicketInput hook - Form state for ticket input dialog
 *
 * Manages input parsing, validation, Jira fetching, and submission.
 */

import { createSignal, createMemo } from "solid-js";
import type { AgentType } from "../../types/config.ts";
import type { JiraIssue } from "../../hooks/use-atlassian/index.ts";
import type { UseTicketInputReturn } from "./types.ts";
import { extractTicketKey, isValidTicketKey } from "./parse-ticket-key.ts";

export interface UseTicketInputOptions {
  /** Function to fetch Jira issue */
  fetchIssue: (ticketKey: string) => Promise<JiraIssue>;
  /** Called on successful submission */
  onSubmit: (ticketKey: string, agent: AgentType, jiraIssue: JiraIssue) => void;
  /** Default agent selection */
  defaultAgent?: AgentType;
}

/**
 * Hook for managing ticket input form state
 *
 * @example
 * ```tsx
 * const form = useTicketInput({
 *   fetchIssue: atlassian.fetchIssue,
 *   onSubmit: (key, agent, issue) => {
 *     tickets.create({ jiraKey: key, agent, ... });
 *   },
 * });
 *
 * <TextInput value={form.input()} onChange={form.setInput} />
 * <Select value={form.agent()} onChange={form.setAgent} />
 * <button onClick={form.submit} disabled={!form.isValid()}>Add</button>
 * ```
 */
export function useTicketInput(options: UseTicketInputOptions): UseTicketInputReturn {
  const [input, setInput] = createSignal("");
  const [agent, setAgent] = createSignal<AgentType>(options.defaultAgent ?? "opencode");
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [jiraIssue, setJiraIssue] = createSignal<JiraIssue | null>(null);

  // Derived: parsed ticket key from input
  const ticketKey = createMemo(() => extractTicketKey(input()));

  // Derived: form is valid when we have a valid ticket key
  const isValid = createMemo(() => isValidTicketKey(ticketKey()));

  const reset = () => {
    setInput("");
    setAgent(options.defaultAgent ?? "opencode");
    setIsLoading(false);
    setError(null);
    setJiraIssue(null);
  };

  const submit = async (): Promise<void> => {
    const key = ticketKey();

    if (!isValidTicketKey(key)) {
      setError("Invalid ticket key format. Expected: PROJECT-123");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const issue = await options.fetchIssue(key);
      setJiraIssue(issue);
      options.onSubmit(key, agent(), issue);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch ticket";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    input,
    setInput,
    ticketKey,
    agent,
    setAgent,
    isLoading,
    error,
    jiraIssue,
    submit,
    reset,
    isValid,
  };
}
