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
import { clearSessionCache } from "../use-agent-summary/index.ts";
import { openUrl } from "#core/utils/index.ts";
import type { UseLayoutActionsOptions, UseLayoutActionsReturn } from "./types.ts";

/**
 * Hook that provides all layout action handlers
 *
 * Uses TicketsContext, WorkflowContext, and ModalSystem internally
 * to avoid prop drilling.
 *
 * @example
 * ```tsx
 * function Layout() {
 *   const actions = useLayoutActions({
 *     currentTicketId: () => currentTicket()?.id,
 *     reloadTickets: tickets.reload,
 *     onQuit: renderer.destroy,
 *   });
 *
 *   useKeyboard((key) => {
 *     if (key.name === 'n') actions.addTicket();
 *     if (key.name === 's') actions.toggleAgent();
 *   });
 * }
 * ```
 */
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

    // Clear cached session data so agent summary re-fetches fresh data
    clearSessionCache(ticketId);

    if (isRunning) {
      console.log("[DEBUG] Stopping agent for", ticketId);
      const result = await workflow.stopWork(ticketId);
      console.log("[DEBUG] stopWork result:", result);
    } else {
      console.log("[DEBUG] Starting agent for", ticketId);
      setAgentStartingFor(ticketId);
      try {
        const result = await workflow.restartAgent(ticketId);
        console.log("[DEBUG] restartAgent result:", result);

        // Poll for "running" state to avoid starting -> idle -> running flicker
        // The agent process may take a moment to report running state
        const pollForRunning = (attempts = 0) => {
          // Reload agents if the method exists (it may not in tests)
          if (typeof workflow.reloadAgents === "function") {
            workflow.reloadAgents();
          }

          const state = workflow.getAgentState(ticketId);
          console.log("[DEBUG] Post-start agent state:", state, "attempt:", attempts);

          // Only clear "starting" override when we reach a definitive state
          // "running" = agent started successfully
          // "crashed" / "stopped" = agent failed to start or was stopped
          if (state === "running" || state === "crashed" || state === "stopped") {
            setAgentStartingFor(null);
          } else if (attempts < 10) {
            // Keep polling - don't give up and show "idle" flicker
            // Poll up to 10 times (1 second total) for the agent to reach running state
            setTimeout(() => pollForRunning(attempts + 1), 100);
          }
          // If we hit max attempts without a definitive state, keep showing "starting"
          // The next health check will naturally update the state
        };

        // Start polling after a brief delay
        setTimeout(() => pollForRunning(0), 50);
      } catch (err) {
        console.log("[DEBUG] restartAgent error:", err);
        setAgentStartingFor(null);
      }
      reloadTickets();
      console.log("[DEBUG] Tickets reloaded");
      return;
    }
    reloadTickets();
    console.log("[DEBUG] Tickets reloaded");
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
    isAgentStarting,
    getAgentState,
  };
}
