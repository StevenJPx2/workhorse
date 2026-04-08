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
 * Input for jiratown_update_status tool
 */
export interface UpdateStatusInput {
  status:
    | "planning"
    | "implementing"
    | "testing"
    | "pr_created"
    | "in_review"
    | "done";
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
