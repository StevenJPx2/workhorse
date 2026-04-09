/**
 * In-memory agent state store and helpers
 */

import type { AgentInstance, AgentState } from "./types.ts";

const activeAgents = new Map<string, AgentInstance>();

export { activeAgents };

export function createAgentInstance(
  ticketId: string,
  agentType: "opencode" | "claude"
): AgentInstance {
  return {
    ticketId,
    agentType,
    state: "idle",
    session: null,
    worktree: null,
    startedAt: null,
    stoppedAt: null,
    lastHealthCheck: null,
    mcpConfigPath: null,
  };
}

export function updateAgentState(ticketId: string, state: AgentState): void {
  const agent = activeAgents.get(ticketId);
  if (agent) {
    agent.state = state;
    if (state === "running") {
      agent.startedAt = new Date().toISOString();
    } else if (state === "stopped" || state === "crashed") {
      agent.stoppedAt = new Date().toISOString();
    }
  }
}

export function getAgent(ticketId: string): AgentInstance | undefined {
  return activeAgents.get(ticketId);
}

export function getAllAgents(): AgentInstance[] {
  return Array.from(activeAgents.values());
}

export function getAgentsByState(state: AgentState): AgentInstance[] {
  return getAllAgents().filter((a) => a.state === state);
}