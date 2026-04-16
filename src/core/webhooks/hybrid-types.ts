/**
 * Hybrid controller types
 */

import type { Database } from "bun:sqlite";
import type { WebhookEvent } from "./types.ts";
import type { GitHubPollerOptions } from "../pollers/github-poller.ts";
import type { JiraPollerOptions } from "../pollers/jira-poller.ts";

export type HybridMode = "webhooks" | "polling" | "hybrid";

export interface HybridControllerConfig {
  /** Database for storing notifications */
  db: Database;
  /** Mode of operation */
  mode: HybridMode;
  /** Webhook server port (required for webhooks/hybrid mode) */
  webhookPort?: number;
  /** Webhook server host */
  webhookHost?: string;
  /** GitHub webhook secret */
  githubSecret?: string;
  /** Jira webhook secret */
  jiraSecret?: string;
  /** Polling interval in ms (default: 30000) */
  pollingInterval?: number;
  /** Callback when webhook is received */
  onWebhookReceived?: (event: WebhookEvent) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface TrackedPr {
  ticketId: string;
  repo: string;
  prNumber: number;
  fetchReviews: GitHubPollerOptions["fetchReviews"];
  fetchComments: GitHubPollerOptions["fetchComments"];
}

export interface TrackedTicket {
  ticketId: string;
  fetchComments: JiraPollerOptions["fetchComments"];
}

export interface HybridController {
  /** Start the controller (webhook server if applicable) */
  start: () => Promise<void>;
  /** Stop the controller */
  stop: () => Promise<void>;
  /** Track a GitHub PR for events */
  trackPr: (pr: TrackedPr) => void;
  /** Stop tracking a PR */
  untrackPr: (repo: string, prNumber: number) => void;
  /** Track a Jira ticket for events */
  trackTicket: (ticket: TrackedTicket) => void;
  /** Stop tracking a ticket */
  untrackTicket: (ticketId: string) => void;
  /** Get webhook server URL (if running) */
  getWebhookUrl: () => string | null;
  /** Check if webhooks are active */
  isWebhooksActive: () => boolean;
}
