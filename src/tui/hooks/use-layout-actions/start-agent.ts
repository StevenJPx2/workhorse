/**
 * startAgent helper - Shared agent start logic with polling
 *
 * Extracted from useLayoutActions to keep file size under 200 lines.
 */

import { clearSessionCache } from "../use-agent-summary/index.ts";
import type { UseWorkflowReturn } from "../use-ticket-workflow/types.ts";

export interface StartAgentDeps {
  workflow: UseWorkflowReturn;
  setAgentStartingFor: (id: string | null) => void;
  reloadTickets: () => void;
}

/**
 * Start agent for a ticket, with polling for state confirmation.
 * Sets the "starting" flag, clears session cache, and polls until
 * the agent reaches a definitive state (running/crashed/stopped).
 */
export async function doStartAgent(ticketId: string, deps: StartAgentDeps): Promise<void> {
  const { workflow, setAgentStartingFor, reloadTickets } = deps;

  console.log("[DEBUG] Starting agent for", ticketId);
  setAgentStartingFor(ticketId);
  clearSessionCache(ticketId);

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
}
