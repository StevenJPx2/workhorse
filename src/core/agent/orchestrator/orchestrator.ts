/**
 * Agent Orchestrator - Re-exports and agent lifecycle operations
 *
 * Coordinates the lifecycle of AI agents working on tickets:
 * - Creates git worktrees for code isolation
 * - Spawns tmux sessions for process isolation
 * - Generates MCP configs for agent communication
 * - Monitors agent health
 */

import type { StopResult } from "./types.ts";
import { killSession, sendKeys, capturePane } from "../../session/tmux/index.ts";
import { removeMcpConfig } from "./mcp-config.ts";
import { removeWorktree } from "../../session/worktree/index.ts";
import { hasSessionMemory, addSessionEvent } from "../../session/session-memory.ts";
import { activeAgents, updateAgentState } from "./agent-store.ts";

// Re-export all public API from sub-modules
export { spawnAgent } from "./spawn-agent.ts";
export { checkAgentHealth } from "./health-check.ts";
export { getAgent, getAllAgents, getAgentsByState } from "./agent-store.ts";
export { discoverAgents, discoverAgentByTicketId } from "./discover-agents.ts";

/**
 * Stop an agent working on a ticket
 *
 * This function:
 * 1. Kills the tmux session
 * 2. Optionally removes the worktree
 * 3. Cleans up MCP config
 */
export async function stopAgent(
  ticketId: string,
  repoPath: string,
  removeWorktreeOnStop: boolean = false,
): Promise<StopResult> {
  const instance = activeAgents.get(ticketId);

  if (!instance) {
    return {
      success: false,
      error: `No agent found for ticket ${ticketId}`,
    };
  }

  updateAgentState(ticketId, "stopping");

  try {
    if (instance.worktree && hasSessionMemory(instance.worktree.path)) {
      addSessionEvent(instance.worktree.path, {
        timestamp: new Date().toISOString(),
        type: "status_change",
        description: "Agent session stopped",
      });
    }

    if (instance.session) {
      await killSession(ticketId);
    }

    if (instance.worktree) {
      removeMcpConfig(instance.worktree.path, ticketId);
    }

    if (removeWorktreeOnStop && instance.worktree) {
      await removeWorktree(repoPath, ticketId);
    }

    updateAgentState(ticketId, "stopped");
    activeAgents.delete(ticketId);

    return { success: true };
  } catch (error) {
    updateAgentState(ticketId, "crashed");
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Send a message to an agent
 */
export async function sendMessageToAgent(ticketId: string, message: string): Promise<boolean> {
  const instance = activeAgents.get(ticketId);

  if (!instance || instance.state !== "running") {
    return false;
  }

  return await sendKeys(ticketId, message, true);
}

/**
 * Capture current agent output
 */
export async function captureAgentOutput(ticketId: string): Promise<string | null> {
  const instance = activeAgents.get(ticketId);

  if (!instance || instance.state !== "running") {
    return null;
  }

  return await capturePane(ticketId);
}
