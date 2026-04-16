/**
 * useAtlassian hook - Atlassian MCP client for Jira API
 *
 * Provides reactive state management for the Atlassian MCP connection.
 */

import { createSignal, onCleanup } from "solid-js";
import { AtlassianClient, createAtlassianClient } from "#core/jira/index.ts";
import type { JiraIssue, AtlassianUserInfo } from "#core/jira/index.ts";
import type { UseAtlassianOptions, UseAtlassianReturn, CloudIdOption } from "./types.ts";

/** Resolve cloudId from either a static string or a getter function */
function resolveCloudId(cloudId: CloudIdOption | undefined): string | undefined {
  if (typeof cloudId === "function") {
    return cloudId();
  }
  return cloudId;
}

/** Check if a cloudId value is valid (non-empty string) */
function isValidCloudId(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Hook for interacting with Jira via Atlassian MCP.
 * Supports static cloudId or a getter function for async config loading.
 */
export function useAtlassian(options: UseAtlassianOptions = {}): UseAtlassianReturn {
  const [isConnected, setIsConnected] = createSignal(false);
  const [isConnecting, setIsConnecting] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  let connectionPromise: Promise<void> | null = null;

  let client: AtlassianClient | null = null;

  /**
   * Get or create the Atlassian client.
   * Waits briefly for config to load if cloudId is not immediately available.
   */
  const getClient = async (): Promise<AtlassianClient> => {
    if (client) return client;

    // Try to resolve cloudId, with retry for async config loading
    let cloudId = resolveCloudId(options.cloudId);

    // If cloudId is not available (undefined or empty string), wait briefly for config to load (up to 2 seconds)
    if (!isValidCloudId(cloudId)) {
      for (let i = 0; i < 20; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        cloudId = resolveCloudId(options.cloudId);
        if (isValidCloudId(cloudId)) break;
      }
    }

    if (!isValidCloudId(cloudId)) {
      throw new Error(
        "Jira cloud ID is not configured. Run 'jiratown setup' to configure your Jira instance.",
      );
    }

    client = createAtlassianClient({ cloudId });
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

        const c = await getClient();
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
      const c = await getClient();
      return await c.fetchIssue(ticketKey);
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
      const c = await getClient();
      await c.addComment(ticketKey, body);
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
      const c = await getClient();
      await c.transitionIssue(ticketKey, transitionId);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      options.onError?.(e);
      throw e;
    }
  };

  const getCurrentUser = async (): Promise<AtlassianUserInfo> => {
    await ensureConnected();
    try {
      setError(null);
      const c = await getClient();
      return await c.getCurrentUser();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      options.onError?.(e);
      throw e;
    }
  };

  const editIssue = async (ticketKey: string, fields: Record<string, unknown>): Promise<void> => {
    await ensureConnected();
    try {
      setError(null);
      const c = await getClient();
      await c.editIssue(ticketKey, fields);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      options.onError?.(e);
      throw e;
    }
  };

  const assignIssue = async (ticketKey: string, accountId: string): Promise<void> => {
    await ensureConnected();
    try {
      setError(null);
      const c = await getClient();
      await c.assignIssue(ticketKey, accountId);
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
    getCurrentUser,
    editIssue,
    assignIssue,
  };
}
