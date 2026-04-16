/**
 * Hybrid webhook/polling controller
 *
 * Always runs in hybrid mode: uses webhooks when available, falls back to polling.
 * Webhook handlers look up tickets directly from the database.
 */

import type { WebhookServer } from "./types.ts";
import type {
  HybridControllerConfig,
  TrackedPr,
  TrackedTicket,
  HybridController,
} from "./hybrid-types.ts";
import { createWebhookServer } from "./server.ts";
import { createGitHubPoller } from "../pollers/github-poller.ts";
import { createJiraPoller } from "../pollers/jira-poller.ts";
import type { Poller, GitHubPollResult, JiraPollResult } from "../pollers/types.ts";

const DEFAULT_POLLING_INTERVAL = 30_000;

/**
 * Create a hybrid webhook/polling controller
 *
 * Webhooks are enabled when webhookPort is provided. Polling always runs as fallback.
 */
export function createHybridController(config: HybridControllerConfig): HybridController {
  let webhookServer: WebhookServer | null = null;
  let webhooksActive = false;

  const githubPollers = new Map<string, Poller<GitHubPollResult>>();
  const jiraPollers = new Map<string, Poller<JiraPollResult>>();

  const pollingInterval = config.pollingInterval ?? DEFAULT_POLLING_INTERVAL;

  const start = async (): Promise<void> => {
    // Start webhook server if port is configured
    if (config.webhookPort) {
      try {
        webhookServer = createWebhookServer({
          db: config.db,
          port: config.webhookPort,
          host: config.webhookHost,
          onWebhookReceived: config.onWebhookReceived,
          onError: config.onError,
        });
        await webhookServer.start();
        webhooksActive = true;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        config.onError?.(err);
        console.warn("[HybridController] Webhooks failed, using polling only");
      }
    }
  };

  const stop = async (): Promise<void> => {
    if (webhookServer) {
      await webhookServer.stop();
      webhookServer = null;
      webhooksActive = false;
    }
    for (const poller of githubPollers.values()) poller.stop();
    for (const poller of jiraPollers.values()) poller.stop();
    githubPollers.clear();
    jiraPollers.clear();
  };

  const trackPr = (pr: TrackedPr): void => {
    const key = `${pr.repo}#${pr.prNumber}`;

    // Start polling (it's the fallback, and deduplication handles duplicates)
    if (!githubPollers.has(key)) {
      const poller = createGitHubPoller({
        db: config.db,
        ticketId: pr.ticketId,
        prNumber: pr.prNumber,
        interval: pollingInterval,
        fetchReviews: pr.fetchReviews,
        fetchComments: pr.fetchComments,
        autoStart: true,
        onError: config.onError,
      });
      githubPollers.set(key, poller);
    }
  };

  const untrackPr = (repo: string, prNumber: number): void => {
    const key = `${repo}#${prNumber}`;
    const poller = githubPollers.get(key);
    if (poller) {
      poller.stop();
      githubPollers.delete(key);
    }
  };

  const trackTicket = (ticket: TrackedTicket): void => {
    // Start polling
    if (!jiraPollers.has(ticket.ticketId)) {
      const poller = createJiraPoller({
        db: config.db,
        ticketId: ticket.ticketId,
        interval: pollingInterval,
        fetchComments: ticket.fetchComments,
        autoStart: true,
        onError: config.onError,
      });
      jiraPollers.set(ticket.ticketId, poller);
    }
  };

  const untrackTicket = (ticketId: string): void => {
    const poller = jiraPollers.get(ticketId);
    if (poller) {
      poller.stop();
      jiraPollers.delete(ticketId);
    }
  };

  return {
    start,
    stop,
    trackPr,
    untrackPr,
    trackTicket,
    untrackTicket,
    getWebhookUrl: () => webhookServer?.getUrl() ?? null,
    isWebhooksActive: () => webhooksActive,
  };
}
