/**
 * Get agent status using OpenCode SDK
 *
 * Connects to the agent's OpenCode instance using its ticket-specific port.
 * Each agent runs on its own port (14100+), not the user's main OpenCode (4096).
 */

import { createOpencodeClient } from "@opencode-ai/sdk";
import type { AgentStep } from "./types.ts";
import { extractStatusFromMessage } from "./extract-status.ts";
import { getPortForTicket } from "../../harness/orchestrator/opencode-client/port-manager.ts";

// Cache clients by ticket ID (each agent has its own port)
const clientCache = new Map<string, ReturnType<typeof createOpencodeClient>>();

// Cache session IDs by ticket ID
const sessionCache = new Map<string, string>();

function getClientForTicket(ticketId: string) {
  let client = clientCache.get(ticketId);
  if (!client) {
    const port = getPortForTicket(ticketId);
    client = createOpencodeClient({ baseUrl: `http://localhost:${port}` });
    clientCache.set(ticketId, client);
  }
  return client;
}

/**
 * Get the session ID for a ticket (cached)
 */
async function getSessionId(ticketId: string, worktreePath: string): Promise<string | null> {
  const cached = sessionCache.get(ticketId);
  if (cached) return cached;

  try {
    const client = getClientForTicket(ticketId);
    const sessions = await client.session.list({
      query: { directory: worktreePath },
    });

    if (!sessions.data?.length) return null;

    // Get the most recent session
    const latestSession = sessions.data.sort(
      (a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0),
    )[0];

    sessionCache.set(ticketId, latestSession.id);
    return latestSession.id;
  } catch {
    return null;
  }
}

/**
 * Get the last assistant message from a session
 */
async function getLastMessageFromSession(
  ticketId: string,
  sessionId: string,
): Promise<string | null> {
  try {
    const client = getClientForTicket(ticketId);
    const messages = await client.session.messages({ path: { id: sessionId } });

    if (!messages.data?.length) return null;

    // Find the last assistant message
    for (let i = messages.data.length - 1; i >= 0; i--) {
      const msg = messages.data[i];
      if (msg.info?.role === "assistant" && msg.parts) {
        const textParts = msg.parts
          .filter((p) => p.type === "text" && "text" in p)
          .map((p) => (p as { text: string }).text);

        if (textParts.length > 0) return textParts.join("\n");
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Clear cached session ID for a ticket (call when agent restarts)
 */
export function clearSessionCache(ticketId: string): void {
  sessionCache.delete(ticketId);
  clientCache.delete(ticketId); // Also clear client since port might change
}

/**
 * Clear all cached data
 */
export function clearAllSessionCache(): void {
  sessionCache.clear();
  clientCache.clear();
}

/**
 * Get agent status by ticket ID and worktree path
 *
 * Connects to the agent's OpenCode instance (on its specific port) and
 * fetches the most recent session messages.
 */
export async function getAgentStatus(ticketId: string, worktreePath: string): Promise<AgentStep[]> {
  if (!ticketId || !worktreePath) {
    return [];
  }

  // Get session ID (cached after first lookup)
  const sessionId = await getSessionId(ticketId, worktreePath);
  if (!sessionId) {
    return [];
  }

  // Fetch messages from that session
  const message = await getLastMessageFromSession(ticketId, sessionId);
  if (message) {
    return extractStatusFromMessage(message);
  }

  return [];
}
