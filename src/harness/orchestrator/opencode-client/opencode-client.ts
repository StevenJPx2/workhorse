/**
 * OpenCode SDK Client
 *
 * Provides integration with OpenCode's API for:
 * - Health checking (is the agent server running?)
 * - Session state queries
 * - Real-time event subscriptions
 *
 * Each agent runs its own OpenCode server on a unique port.
 * We track the port per ticket to communicate with the right instance.
 */

import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";
import { getPortForTicket } from "./port-manager.ts";
import type {
  OpenCodeHealth,
  OpenCodeSessionStatus,
  OpenCodeEventType,
  OpenCodeEvent,
  EventSubscription,
} from "./types.ts";

export type { OpencodeClient };

/**
 * Create an OpenCode client for a specific ticket
 */
export function createClientForTicket(ticketId: string): OpencodeClient {
  const port = getPortForTicket(ticketId);
  return createOpencodeClient({
    baseUrl: `http://127.0.0.1:${port}`,
  });
}

/**
 * Check if an OpenCode instance is healthy by trying to list sessions
 *
 * This is the primary way to check if the AI agent is actually running,
 * not just that the tmux session exists.
 */
export async function checkOpenCodeHealth(ticketId: string): Promise<OpenCodeHealth> {
  try {
    const client = createClientForTicket(ticketId);
    const response = await client.session.list();

    if (response.data) {
      return { healthy: true };
    }

    return { healthy: false, error: "No data in response" };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get the status of OpenCode sessions for a ticket
 *
 * Returns whether sessions are idle, busy, or retrying
 */
export async function getOpenCodeStatus(ticketId: string): Promise<OpenCodeSessionStatus> {
  try {
    const client = createClientForTicket(ticketId);
    const response = await client.session.status();

    if (response.data) {
      const statuses = Object.values(response.data);
      for (const status of statuses) {
        if (status.type === "busy") {
          return { type: "busy" };
        }
        if (status.type === "retry") {
          return {
            type: "retry",
            attempt: status.attempt,
            message: status.message,
            next: status.next,
          };
        }
      }
      return { type: "idle" };
    }

    return { type: "idle" };
  } catch (error) {
    return {
      type: "offline",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Subscribe to events from an OpenCode instance
 *
 * This enables real-time updates of agent state.
 * Events come wrapped in GlobalEvent: { directory, payload: Event }
 */
export async function subscribeToEvents(
  ticketId: string,
  onEvent: (event: OpenCodeEvent) => void,
  onError?: (error: Error) => void,
): Promise<EventSubscription> {
  const client = createClientForTicket(ticketId);
  let aborted = false;

  (async () => {
    try {
      const result = await client.global.event();

      if (result && Symbol.asyncIterator in result) {
        for await (const rawEvent of result as AsyncIterable<unknown>) {
          if (aborted) break;

          // SDK wraps events in GlobalEvent: { directory, payload }
          const globalEvent = rawEvent as { directory?: string; payload?: unknown };
          const payload = globalEvent.payload ?? rawEvent;

          const eventData = payload as {
            type?: string;
            properties?: Record<string, unknown>;
          };

          onEvent({
            type: (eventData.type as OpenCodeEventType) ?? "unknown",
            properties: eventData.properties ?? {},
          });
        }
      }
    } catch (error) {
      if (!aborted && onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  })();

  return {
    unsubscribe: () => {
      aborted = true;
    },
  };
}

/**
 * Build the OpenCode command with server port
 *
 * OpenCode needs to be started with a specific port so we can connect to it.
 */
export function buildOpenCodeCommandWithPort(ticketId: string): {
  command: string;
  args: string[];
} {
  const port = getPortForTicket(ticketId);
  return {
    command: "opencode",
    args: ["--port", String(port)],
  };
}
