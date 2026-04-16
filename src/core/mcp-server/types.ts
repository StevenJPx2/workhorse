/**
 * Types for Jiratown MCP Server
 */

import type { Notification } from "../notifications/types.ts";

/**
 * Response from jiratown_get_notifications tool
 */
export interface GetNotificationsResponse {
  notifications: Notification[];
  system_instruction: string | null;
}

/**
 * Input for jiratown_acknowledge tool
 */
export interface AcknowledgeInput {
  notification_ids: string[];
}

/**
 * Response from jiratown_acknowledge tool
 */
export interface AcknowledgeResponse {
  acknowledged_count: number;
}

/**
 * Input for jiratown_escalate tool
 */
export interface EscalateInput {
  questions: string[];
  context: string;
  blocking: boolean;
}

/**
 * Response from jiratown_escalate tool
 */
export interface EscalateResponse {
  success: boolean;
  message: string;
  notification_id?: string;
}

/**
 * Valid ticket workflow statuses
 */
export type TicketStatus =
  | "pending"
  | "queued"
  | "planning"
  | "implementing"
  | "blocked"
  | "testing"
  | "pr_created"
  | "in_review"
  | "done";

/**
 * Input for jiratown_update_status tool
 */
export interface UpdateStatusInput {
  status: TicketStatus;
  message?: string;
}

/**
 * Response from jiratown_update_status tool
 */
export interface UpdateStatusResponse {
  success: boolean;
  previous_status: string;
  new_status: string;
}

/**
 * Context provided to MCP tool handlers
 */
export interface JiratownToolContext {
  ticketId: string;
}

/**
 * Input for jiratown_open_pr tool
 */
export interface OpenPRInput {
  title: string;
  body: string;
  base_branch?: string;
}

/**
 * Response from jiratown_open_pr tool
 */
export interface OpenPRResponse {
  success: boolean;
  pr_url?: string;
  pr_number?: number;
  message: string;
  /** Owner of the repo (for GitHub polling) */
  owner?: string;
  /** Repo name (for GitHub polling) */
  repo?: string;
}

/**
 * Callback data when a PR is created successfully
 */
export interface PRCreatedEvent {
  ticketId: string;
  prUrl: string;
  prNumber: number;
  owner: string;
  repo: string;
}

/**
 * Options for creating the Jiratown MCP server
 */
export interface JiratownServerOptions {
  /** Called when a PR is successfully created - use to start GitHub polling */
  onPRCreated?: (event: PRCreatedEvent) => void;
}
