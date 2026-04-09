/**
 * Types for useAgentStream hook
 *
 * Provides real-time streaming from OpenCode SDK events
 */

import type { OpenCodeEvent } from "../../harness/orchestrator/opencode-client/types.ts";

/**
 * A formatted message from the agent stream
 */
export interface StreamMessage {
  /** Unique ID for the message */
  id: string;
  /** Timestamp of when we received it */
  timestamp: string;
  /** The content/text of the message */
  content: string;
  /** Type of message for styling */
  type: "assistant" | "tool" | "system" | "error";
}

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
  messages: () => StreamMessage[];
  /** Whether we're connected to the stream */
  isConnected: () => boolean;
  /** Last error if any */
  error: () => string | null;
  /** Clear all messages */
  clear: () => void;
  /** Raw events for debugging */
  lastEvent: () => OpenCodeEvent | null;
}
