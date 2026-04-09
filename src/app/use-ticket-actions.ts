/**
 * useTicketActions - Composable hook for ticket action handlers
 *
 * Encapsulates the handlers for ticket operations (escalate, switch agent,
 * open Jira, close, send message, agent control) to reduce prop drilling.
 */

import type { Ticket } from "../types/ticket.ts";
import type { AgentType } from "../types/config.ts";

export interface TicketActionsContext {
  actions: {
    update: (id: string, data: { agent: AgentType }) => void;
    remove: (id: string) => void;
  };
  workflow: {
    sendToAgent: (ticketId: string, message: string) => Promise<boolean>;
    stopWork: (ticketId: string, removeWorktree?: boolean) => Promise<boolean>;
  };
}

export interface UseTicketActionsReturn {
  onEscalate: () => void;
  onSwitchAgent: (agent: AgentType) => void;
  onOpenJira: () => void;
  onClose: () => void;
  onSendMessage: (message: string) => Promise<void>;
  /** Stop the agent */
  onStop: () => Promise<void>;
}

/**
 * Creates ticket action handlers bound to a specific ticket
 */
export function useTicketActions(
  ticket: Ticket,
  context: TicketActionsContext
): UseTicketActionsReturn {
  return {
    onEscalate: () => {
      console.log("Escalate", ticket.id);
    },
    onSwitchAgent: (agent: AgentType) => {
      context.actions.update(ticket.id, { agent });
    },
    onOpenJira: () => {
      if (ticket.jira_url) {
        console.log("Opening", ticket.jira_url);
      }
    },
    onClose: () => {
      context.actions.remove(ticket.id);
    },
    onSendMessage: async (message: string) => {
      await context.workflow.sendToAgent(ticket.id, message);
    },
    onStop: async () => {
      await context.workflow.stopWork(ticket.id);
    },
  };
}
