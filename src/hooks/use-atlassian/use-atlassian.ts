/**
 * useAtlassian hook - Atlassian MCP client for Jira API
 *
 * Provides reactive state management for the Atlassian MCP connection.
 */

import { createSignal, onCleanup } from "solid-js";
import { AtlassianClient, createAtlassianClient } from "./client.ts";
import type { UseAtlassianOptions, UseAtlassianReturn, JiraIssue, CloudIdOption } from "./types.ts";

/**
 * Resolve cloudId from either a static string or a getter function.
 * This allows the cloudId to be provided lazily after config loads.
 */
function resolveCloudId(cloudId: CloudIdOption | undefined): string | undefined {
  if (typeof cloudId === "function") {
    return cloudId();
  }
  return cloudId;
}

/**
 * Hook for interacting with Jira via Atlassian MCP
 *
 * @example
 * ```tsx
 * function TicketFetcher() {
 *   const atlassian = useAtlassian({
 *     cloudId: 'yourcompany.atlassian.net',
 *     autoConnect: true,
 *   });
 *
 *   // Or with a reactive getter (useful when config loads async):
 *   const atlassian = useAtlassian({
 *     cloudId: () => config.config()?.jira.cloud_id,
 *   });
 *
 *   const handleFetch = async () => {
 *     const issue = await atlassian.fetchIssue('AM-123');
 *     console.log(issue.summary);
 *   };
 *
 *   return (
 *     <box>
 *       <text>Connected: {atlassian.isConnected() ? 'Yes' : 'No'}</text>
 *       <button onPress={handleFetch}>Fetch AM-123</button>
 *     </box>
 *   );
 * }
 * ```
 */
export function useAtlassian(options: UseAtlassianOptions = {}): UseAtlassianReturn {
  const [isConnected, setIsConnected] = createSignal(false);
  const [isConnecting, setIsConnecting] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  let connectionPromise: Promise<void> | null = null;

  let client: AtlassianClient | null = null;

  const getClient = (): AtlassianClient => {
    if (!client) {
      const cloudId = resolveCloudId(options.cloudId);
      if (!cloudId) {
        throw new Error(
          "Jira cloud ID is not configured. Run 'jiratown setup' to configure your Jira instance.",
        );
      }
      client = createAtlassianClient({ cloudId });
    }
    return client;
  };

  const connect = async (): Promise<void> => {
    // Return existing promise if connection is in progress
    if (connectionPromise) return connectionPromise;

    if (isConnected()) return;

    connectionPromise = (async () => {
      try {
        setIsConnecting(true);
        setError(null);

        const c = getClient();
        await c.connect();

        setIsConnected(true);
        options.onConnectionChange?.(true);
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        options.onError?.(e);
        throw e;
      } finally {
        setIsConnecting(false);
        connectionPromise = null;
      }
    })();

    return connectionPromise;
  };

  const disconnect = async (): Promise<void> => {
    if (!isConnected() || !client) return;

    try {
      await client.disconnect();
      setIsConnected(false);
      options.onConnectionChange?.(false);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      options.onError?.(e);
      throw e;
    }
  };

  const ensureConnected = async (): Promise<void> => {
    if (!isConnected()) {
      await connect();
    }
  };

  const fetchIssue = async (ticketKey: string): Promise<JiraIssue> => {
    await ensureConnected();
    try {
      setError(null);
      return await getClient().fetchIssue(ticketKey);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      options.onError?.(e);
      throw e;
    }
  };

  const addComment = async (ticketKey: string, body: string): Promise<void> => {
    await ensureConnected();
    try {
      setError(null);
      await getClient().addComment(ticketKey, body);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      options.onError?.(e);
      throw e;
    }
  };

  const transitionIssue = async (ticketKey: string, transitionId: string): Promise<void> => {
    await ensureConnected();
    try {
      setError(null);
      await getClient().transitionIssue(ticketKey, transitionId);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      options.onError?.(e);
      throw e;
    }
  };

  // Auto-connect if requested
  if (options.autoConnect && options.cloudId) {
    connect().catch(() => {
      // Error is already captured in state
    });
  }

  // Cleanup on unmount
  onCleanup(() => {
    if (client?.isConnected) {
      client.disconnect().catch(() => {
        // Ignore cleanup errors
      });
    }
  });

  return {
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    fetchIssue,
    addComment,
    transitionIssue,
  };
}
