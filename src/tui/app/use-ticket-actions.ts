/**
 * useTicketActions - Composable hook for ticket action handlers
 *
 * Encapsulates the handlers for ticket operations (escalate, switch agent,
 * open Jira, close, send message, agent control, Jira sync) to reduce
 * prop drilling.
 */

import type { Ticket } from "#types/ticket.ts";
import type { AgentType } from "#types/config.ts";
import type { UseEventLogReturn } from "../hooks/use-event-log/types.ts";
import { openUrl } from "#core/utils/index.ts";

export interface TicketActionsContext {
  actions: {
    update: (id: string, data: { agent: AgentType }) => void;
    remove: (id: string) => void;
  };
  workflow: {
    sendToAgent: (ticketId: string, message: string) => Promise<boolean>;
    stopWork: (ticketId: string, removeWorktree?: boolean) => Promise<boolean>;
    /** Restart agent for an existing ticket */
    restartAgent: (ticketId: string) => Promise<boolean>;
  };
  eventLog?: UseEventLogReturn;
}

export interface UseTicketActionsReturn {
  onEscalate: () => void;
  onSwitchAgent: (agent: AgentType) => void;
  onOpenJira: () => void;
  onClose: () => void;
  onSendMessage: (message: string) => Promise<void>;
  /** Start the agent (restart/spawn) */
  onStart: () => Promise<void>;
  /** Stop the agent */
  onStop: () => Promise<void>;
  /** Sync progress to Jira */
  onSyncToJira: () => void;
  /** Resume work after being blocked (check for responses) */
  onResume: () => Promise<void>;
  /** View ticket in Jira browser */
  onViewJira: () => Promise<void>;
  /** Cancel the ticket (stop agent, remove) */
  onCancel: () => Promise<void>;
  /** Hand off to different agent */
  onHandoff: () => void;
}

/**
 * Creates ticket action handlers bound to a specific ticket
 */
export function useTicketActions(
  ticket: Ticket,
  context: TicketActionsContext,
): UseTicketActionsReturn {
  return {
    onEscalate: () => {
      context.eventLog?.logEscalation(["Manual escalation from ticket pane"]);
    },
    onSwitchAgent: (agent: AgentType) => {
      context.actions.update(ticket.id, { agent });
    },
    onOpenJira: () => {
      if (ticket.jira_url) {
        context.eventLog?.logCustom("notification", {
          action: "open_jira",
          url: ticket.jira_url,
        });
      }
    },
    onClose: () => {
      context.actions.remove(ticket.id);
    },
    onSendMessage: async (message: string) => {
      context.eventLog?.logComment({
        source: "user",
        content: message,
      });
      await context.workflow.sendToAgent(ticket.id, message);
    },
    onStop: async () => {
      await context.workflow.stopWork(ticket.id);
    },
    onStart: async () => {
      context.eventLog?.logCustom("agent_started", {
        action: "manual_start",
        ticketId: ticket.id,
      });
      await context.workflow.restartAgent(ticket.id);
    },
    onSyncToJira: () => {
      context.eventLog?.logCustom("jira_sync", {
        action: "manual_sync",
        ticketId: ticket.id,
      });
    },
    onResume: async () => {
      // Resume work - restart agent to check for Jira responses
      context.eventLog?.logCustom("resume", {
        action: "check_responses",
        ticketId: ticket.id,
      });
      await context.workflow.restartAgent(ticket.id);
    },
    onViewJira: async () => {
      if (ticket.jira_url) {
        context.eventLog?.logCustom("notification", {
          action: "open_jira",
          url: ticket.jira_url,
        });
        await openUrl(ticket.jira_url);
      }
    },
    onCancel: async () => {
      context.eventLog?.logCustom("cancel", {
        action: "cancel_ticket",
        ticketId: ticket.id,
      });
      await context.workflow.stopWork(ticket.id, true);
      context.actions.remove(ticket.id);
    },
    onHandoff: () => {
      // Toggle agent type for handoff
      const newAgent = ticket.agent === "opencode" ? "claude" : "opencode";
      context.eventLog?.logCustom("handoff", {
        action: "switch_agent",
        from: ticket.agent,
        to: newAgent,
      });
      context.actions.update(ticket.id, { agent: newAgent });
    },
  };
}
