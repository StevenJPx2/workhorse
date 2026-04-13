/**
 * useGitHub hook - GitHub MCP client for PR review operations
 *
 * Provides reactive state management for the GitHub MCP connection.
 * Mirrors the useAtlassian hook pattern for consistency.
 */

import { createSignal, onCleanup } from "solid-js";
import { GitHubClient } from "#core/github/client.ts";
import type { GitHubClient as GitHubClientInterface } from "#core/github/types.ts";
import type { CreateReviewParams } from "#core/github/types.ts";
import type { UseGitHubOptions, UseGitHubReturn, UseGitHubDeps } from "./types.ts";
import { withConnection } from "./with-connection.ts";

const defaultDeps: UseGitHubDeps = {
  createClient: () => new GitHubClient(),
};

export function useGitHub(
  options: UseGitHubOptions = {},
  deps: UseGitHubDeps = defaultDeps,
): UseGitHubReturn {
  const [isConnected, setIsConnected] = createSignal(false);
  const [isConnecting, setIsConnecting] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  let connectionPromise: Promise<void> | null = null;

  let client: GitHubClientInterface | null = null;

  const getClient = (): GitHubClientInterface => {
    if (!client) {
      client = deps.createClient();
    }
    return client;
  };

  const connect = async (): Promise<void> => {
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

  const getPullRequest = (owner: string, repo: string, prNumber: number) =>
    withConnection(ensureConnected, setError, options.onError, () =>
      getClient().getPullRequest(owner, repo, prNumber),
    );

  const listPullRequests = (owner: string, repo: string, state?: "open" | "closed" | "all") =>
    withConnection(ensureConnected, setError, options.onError, () =>
      getClient().listPullRequests(owner, repo, state),
    );

  const listReviewComments = (owner: string, repo: string, prNumber: number) =>
    withConnection(ensureConnected, setError, options.onError, () =>
      getClient().listReviewComments(owner, repo, prNumber),
    );

  const listReviews = (owner: string, repo: string, prNumber: number) =>
    withConnection(ensureConnected, setError, options.onError, () =>
      getClient().listReviews(owner, repo, prNumber),
    );

  const createReview = (
    owner: string,
    repo: string,
    prNumber: number,
    params: CreateReviewParams,
  ) =>
    withConnection(ensureConnected, setError, options.onError, () =>
      getClient().createReview(owner, repo, prNumber, params),
    );

  const createReviewComment = (
    owner: string,
    repo: string,
    prNumber: number,
    body: string,
    inReplyTo?: number,
  ) =>
    withConnection(ensureConnected, setError, options.onError, () =>
      getClient().createReviewComment(owner, repo, prNumber, body, inReplyTo),
    );

  if (options.autoConnect) {
    connect().catch(() => {
      // Error is already captured in state
    });
  }

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
    getPullRequest,
    listPullRequests,
    listReviewComments,
    listReviews,
    createReview,
    createReviewComment,
  };
}
