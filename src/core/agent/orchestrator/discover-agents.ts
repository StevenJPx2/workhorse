/**
 * Discover and re-register existing agent sessions
 *
 * On startup, scan for tmux sessions that match Jiratown's naming pattern
 * and re-register them in the activeAgents store.
 */

import { listSessions, sessionExists } from "../../session/tmux/index.ts";
import { activeAgents, createAgentInstance, updateAgentState } from "./agent-store.ts";
import type { AgentInstance } from "./types.ts";

const JIRATOWN_SESSION_PREFIX = "jt-";

/**
 * Extract ticket ID from a Jiratown tmux session name
 * Session names are formatted as "jt-{ticketId}"
 */
function extractTicketId(sessionName: string): string | null {
  if (!sessionName.startsWith(JIRATOWN_SESSION_PREFIX)) {
    return null;
  }
  return sessionName.slice(JIRATOWN_SESSION_PREFIX.length);
}

/**
 * Discover existing Jiratown agent sessions from tmux
 *
 * Scans all tmux sessions, finds ones with "jt-" prefix,
 * and registers them as active agents.
 *
 * @returns Array of discovered agent instances
 */
export async function discoverAgents(): Promise<AgentInstance[]> {
  const discovered: AgentInstance[] = [];

  try {
    const sessions = await listSessions();

    for (const session of sessions) {
      const ticketId = extractTicketId(session.name);
      if (!ticketId) continue;

      // Skip if already registered
      if (activeAgents.has(ticketId)) continue;

      // Verify session still exists
      const exists = await sessionExists(ticketId);
      if (!exists) continue;

      // Create and register the agent instance
      // Default to "opencode" since we can't determine type from tmux
      const instance = createAgentInstance(ticketId, "opencode");
      instance.session = session;

      // Mark as running since the tmux session exists
      activeAgents.set(ticketId, instance);
      updateAgentState(ticketId, "running");

      discovered.push(instance);
    }
  } catch (err) {
    console.error("Error discovering agents:", err);
  }

  return discovered;
}

/**
 * Re-discover a single agent by ticket ID
 *
 * Useful when the TUI needs to check if an agent
 * exists without rescanning all sessions.
 */
export async function discoverAgentByTicketId(ticketId: string): Promise<AgentInstance | null> {
  // Already registered?
  const existing = activeAgents.get(ticketId);
  if (existing) return existing;

  // Check if tmux session exists
  const exists = await sessionExists(ticketId);
  if (!exists) return null;

  // Register it
  const instance = createAgentInstance(ticketId, "opencode");
  instance.session = {
    name: `${JIRATOWN_SESSION_PREFIX}${ticketId}`,
    ticketId,
    workdir: "", // Unknown - would need to query tmux for this
    createdAt: new Date().toISOString(),
  };

  activeAgents.set(ticketId, instance);
  updateAgentState(ticketId, "running");

  return instance;
}
