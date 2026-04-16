/**
 * Hybrid webhook/polling controller
 *
 * Uses webhooks as the primary source of events, with polling as a fallback.
 */

import type { WebhookServer } from "./types.ts";
import type {
  HybridControllerConfig,
  TrackedPr,
  TrackedTicket,
  HybridController,
} from "./hybrid-types.ts";
import { createWebhookServer } from "./server.ts";
import { registerPrTicketMapping, unregisterPrTicketMapping } from "./github-handler.ts";
import { registerTrackedTicket, unregisterTrackedTicket } from "./jira-handler.ts";
import { createGitHubPoller } from "../pollers/github-poller.ts";
import { createJiraPoller } from "../pollers/jira-poller.ts";
import type { Poller, GitHubPollResult, JiraPollResult } from "../pollers/types.ts";

const DEFAULT_POLLING_INTERVAL = 30_000;

/**
 * Create a hybrid webhook/polling controller
 */
export function createHybridController(config: HybridControllerConfig): HybridController {
  let webhookServer: WebhookServer | null = null;
  let webhooksActive = false;

  const githubPollers = new Map<string, Poller<GitHubPollResult>>();
  const jiraPollers = new Map<string, Poller<JiraPollResult>>();
  const trackedPrs = new Map<string, TrackedPr>();
  const trackedTickets = new Map<string, TrackedTicket>();

  const pollingInterval = config.pollingInterval ?? DEFAULT_POLLING_INTERVAL;
  const useWebhooks = config.mode === "webhooks" || config.mode === "hybrid";
  const usePolling = config.mode === "polling" || config.mode === "hybrid";

  const start = async (): Promise<void> => {
    if (useWebhooks && config.webhookPort) {
      try {
        webhookServer = createWebhookServer({
          db: config.db,
          port: config.webhookPort,
          host: config.webhookHost,
          githubSecret: config.githubSecret,
          jiraSecret: config.jiraSecret,
          onWebhookReceived: config.onWebhookReceived,
          onError: config.onError,
        });
        await webhookServer.start();
        webhooksActive = true;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        config.onError?.(err);
        if (config.mode === "hybrid") {
          console.warn("[HybridController] Webhooks failed, falling back to polling");
        }
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
    trackedPrs.clear();
    trackedTickets.clear();
  };

  const trackPr = (pr: TrackedPr): void => {
    const key = `${pr.repo}#${pr.prNumber}`;
    registerPrTicketMapping(pr.repo, pr.prNumber, pr.ticketId);
    trackedPrs.set(key, pr);

    const shouldPoll = usePolling || (config.mode === "hybrid" && !webhooksActive);
    if (shouldPoll && !githubPollers.has(key)) {
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
    unregisterPrTicketMapping(repo, prNumber);
    trackedPrs.delete(key);
    const poller = githubPollers.get(key);
    if (poller) {
      poller.stop();
      githubPollers.delete(key);
    }
  };

  const trackTicket = (ticket: TrackedTicket): void => {
    registerTrackedTicket(ticket.ticketId);
    trackedTickets.set(ticket.ticketId, ticket);

    const shouldPoll = usePolling || (config.mode === "hybrid" && !webhooksActive);
    if (shouldPoll && !jiraPollers.has(ticket.ticketId)) {
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
    unregisterTrackedTicket(ticketId);
    trackedTickets.delete(ticketId);
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
