/**
 * Check if an agent is running for a ticket
 */

import { getAgent } from "../../agent/orchestrator/index.ts";

export function isAgentRunning(ticketId: string): boolean {
  const agent = getAgent(ticketId);
  return agent?.state === "running";
}
