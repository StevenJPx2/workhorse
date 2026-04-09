/**
 * useAgentStream hook - Real-time streaming from OpenCode SDK
 *
 * Subscribes to OpenCode events and formats them for display.
 */

import { createSignal, createEffect, onCleanup } from "solid-js";
import { subscribeToEvents } from "../../harness/orchestrator/opencode-client/index.ts";
import type { OpenCodeEvent } from "../../harness/orchestrator/opencode-client/types.ts";
import { formatEvent } from "./format-event.ts";
import type {
  UseAgentStreamOptions,
  UseAgentStreamReturn,
  StreamMessage,
} from "./types.ts";

const DEFAULT_MAX_MESSAGES = 100;

/**
 * Hook for real-time agent output via OpenCode SDK events
 */
export function useAgentStream(
  options: UseAgentStreamOptions
): UseAgentStreamReturn {
  const maxMessages = options.maxMessages ?? DEFAULT_MAX_MESSAGES;

  const [messages, setMessages] = createSignal<StreamMessage[]>([]);
  const [isConnected, setIsConnected] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [lastEvent, setLastEvent] = createSignal<OpenCodeEvent | null>(null);

  // Track subscription for cleanup
  let unsubscribe: (() => void) | null = null;

  // Subscribe when enabled
  createEffect(() => {
    const enabled = options.enabled ?? true;

    // Cleanup previous subscription
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
      setIsConnected(false);
    }

    if (!enabled || !options.ticketId) {
      return;
    }

    // Subscribe to events
    subscribeToEvents(
      options.ticketId,
      (event) => {
        setLastEvent(event);
        setIsConnected(true);
        setError(null);

        const message = formatEvent(event);
        if (message) {
          setMessages((prev) => {
            const updated = [...prev, message];
            // Trim to max
            if (updated.length > maxMessages) {
              return updated.slice(-maxMessages);
            }
            return updated;
          });
        }
      },
      (err) => {
        setError(err.message);
        setIsConnected(false);
      }
    ).then((sub) => {
      unsubscribe = sub.unsubscribe;
      setIsConnected(true);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  });

  // Cleanup on unmount
  onCleanup(() => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  });

  const clear = () => {
    setMessages([]);
  };

  return {
    messages,
    isConnected,
    error,
    clear,
    lastEvent,
  };
}
