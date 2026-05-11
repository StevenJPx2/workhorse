/**
 * useLayoutActions hook - Centralized action handlers for Layout
 *
 * Eliminates prop drilling by composing workflow, tickets, and modal
 * hooks into a single cohesive interface for Layout keyboard handlers.
 */

import { createSignal } from "solid-js";
import { useTicketsContext } from "../../contexts/tickets-context.tsx";
import { useWorkflowContext } from "../../contexts/workflow-context.tsx";
import { useModalSystem } from "../use-modal-system/index.ts";
import { openUrl } from "#core/utils/index.ts";
import { doStartAgent } from "./start-agent.ts";
import type { UseLayoutActionsOptions, UseLayoutActionsReturn } from "./types.ts";

export function useLayoutActions(options: UseLayoutActionsOptions): UseLayoutActionsReturn {
  const { currentTicketId, reloadTickets, onQuit } = options;
  const tickets = useTicketsContext();
  const workflow = useWorkflowContext();
  const modals = useModalSystem();

  // Track agent starting state
  const [agentStartingFor, setAgentStartingFor] = createSignal<string | null>(null);

  const quit = async (): Promise<void> => {
    console.log("[DEBUG] Quit requested - stopping all running agents");
    const runningAgents = workflow.getRunningAgents();
    for (const agent of runningAgents) {
      console.log("[DEBUG] Stopping agent for ticket:", agent.ticketId);
      await workflow.stopWork(agent.ticketId);
    }
    await onQuit();
  };

  const addTicket = (): void => {
    modals.open("ticket-input");
  };

  const closeTicket = (): void => {
    const ticketId = currentTicketId();
    if (ticketId) {
      tickets.actions.remove(ticketId);
    }
  };

  const openInJira = (): void => {
    const ticket = tickets.currentTicket();
    if (ticket?.jira_url) {
      void openUrl(ticket.jira_url);
    }
  };

  const escalate = (): void => {
    const ticketId = currentTicketId();
    if (ticketId) {
      console.log("Escalate", ticketId);
      // TODO: Implement escalation modal
    }
  };

  const switchAgent = (): void => {
    const ticket = tickets.currentTicket();
    if (ticket) {
      const newAgent = ticket.agent === "opencode" ? "claude" : "opencode";
      tickets.actions.update(ticket.id, { agent: newAgent });
    }
  };

  const startAgent = async (): Promise<void> => {
    console.log("[DEBUG] useLayoutActions startAgent called");
    const ticketId = currentTicketId();
    if (!ticketId) {
      console.log("[DEBUG] No current ticket!");
      return;
    }

    // Don't start if already running or starting
    if (workflow.isAgentRunning(ticketId) || agentStartingFor() === ticketId) {
      console.log("[DEBUG] Agent already running or starting, ignoring");
      return;
    }

    await doStartAgent(ticketId, { workflow, setAgentStartingFor, reloadTickets });
  };

  const toggleAgent = async (): Promise<void> => {
    console.log("[DEBUG] useLayoutActions toggleAgent called");
    const ticketId = currentTicketId();
    console.log("[DEBUG] Current ticket ID:", ticketId);

    if (!ticketId) {
      console.log("[DEBUG] No current ticket!");
      return;
    }

    const isRunning = workflow.isAgentRunning(ticketId);
    const isStarting = agentStartingFor() === ticketId;
    console.log("[DEBUG] Agent running:", isRunning, "starting:", isStarting);

    // Don't allow toggle while already starting
    if (isStarting) {
      console.log("[DEBUG] Agent already starting, ignoring");
      return;
    }

    if (isRunning) {
      console.log("[DEBUG] Stopping agent for", ticketId);
      const result = await workflow.stopWork(ticketId);
      console.log("[DEBUG] stopWork result:", result);
      reloadTickets();
      console.log("[DEBUG] Tickets reloaded");
      return;
    }

    await doStartAgent(ticketId, { workflow, setAgentStartingFor, reloadTickets });
  };

  const isAgentStarting = () => agentStartingFor() !== null;

  const getAgentState = (ticketId: string): string | undefined => {
    // Show "starting" immediately when user pressed 's'
    if (agentStartingFor() === ticketId) {
      return "starting";
    }
    return workflow.getAgentState(ticketId);
  };

  return {
    quit,
    addTicket,
    closeTicket,
    openInJira,
    escalate,
    switchAgent,
    toggleAgent,
    startAgent,
    isAgentStarting,
    getAgentState,
  };
}
