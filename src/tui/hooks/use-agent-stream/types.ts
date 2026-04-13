/**
 * Types for useAgentStream hook
 *
 * Provides real-time streaming from OpenCode SDK events
 */

import type { OpenCodeEvent } from "#core/agent/orchestrator/opencode-client/types.ts";

// Re-export core StreamMessage type
export type { StreamMessage } from "#core/agent/event-formatter/index.ts";

/**
 * Options for the useAgentStream hook
 */
export interface UseAgentStreamOptions {
  /** Ticket ID to subscribe to */
  ticketId: string;
  /** Whether to subscribe (e.g., only when agent is running) */
  enabled?: boolean;
  /** Max messages to keep in buffer */
  maxMessages?: number;
}

/**
 * Return value from useAgentStream
 */
export interface UseAgentStreamReturn {
  /** Stream messages */
  messages: () => import("#core/agent/event-formatter/index.ts").StreamMessage[];
  /** Whether we're connected to the stream */
  isConnected: () => boolean;
  /** Last error if any */
  error: () => string | null;
  /** Clear all messages */
  clear: () => void;
  /** Raw events for debugging */
  lastEvent: () => OpenCodeEvent | null;
}
