/**
 * Jiratown MCP Server
 *
 * Provides tools for agents to communicate with Jiratown:
 * - jiratown_get_notifications: Get pending notifications
 * - jiratown_acknowledge: Mark notifications as handled
 * - jiratown_update_status: Update ticket progress status
 * - jiratown_escalate: Ask questions / request clarification
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { z } from "zod";
import {
  handleGetNotifications,
  handleAcknowledge,
  handleUpdateStatus,
  handleEscalate,
} from "./tools/index.ts";
import type {
  AcknowledgeInput,
  UpdateStatusInput,
  EscalateInput,
} from "./types.ts";

/**
 * Tool name constants
 */
export const TOOL_NAMES = {
  GET_NOTIFICATIONS: "jiratown_get_notifications",
  ACKNOWLEDGE: "jiratown_acknowledge",
  UPDATE_STATUS: "jiratown_update_status",
  ESCALATE: "jiratown_escalate",
} as const;

/**
 * Zod schemas for tool inputs
 */
const GetNotificationsSchema = z.object({});

const AcknowledgeSchema = z.object({
  notification_ids: z
    .array(z.string())
    .describe("IDs of notifications to acknowledge"),
});

const UpdateStatusSchema = z.object({
  status: z
    .enum([
      "planning",
      "implementing",
      "testing",
      "pr_created",
      "in_review",
      "done",
    ])
    .describe("New status for the ticket"),
  message: z.string().optional().describe("Optional status update message"),
});

const EscalateSchema = z.object({
  questions: z
    .array(z.string())
    .min(1)
    .describe("Questions to ask the user"),
  context: z.string().describe("Context about what you were working on"),
  blocking: z
    .boolean()
    .describe("Whether this blocks further work on the ticket"),
});

/**
 * Tool definition type
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType;
}

/**
 * Get tool definitions for registration
 */
export function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: TOOL_NAMES.GET_NOTIFICATIONS,
      description:
        "Get pending notifications for this ticket. Returns notifications " +
        "from Jira comments, GitHub PR reviews, and system events. " +
        "Call this at the start of work and periodically to check for updates.",
      inputSchema: GetNotificationsSchema,
    },
    {
      name: TOOL_NAMES.ACKNOWLEDGE,
      description:
        "Acknowledge notifications after addressing them. " +
        "This marks them as handled so they won't appear again.",
      inputSchema: AcknowledgeSchema,
    },
    {
      name: TOOL_NAMES.UPDATE_STATUS,
      description:
        "Update the ticket's progress status. Use this to report progress " +
        "as you move through planning, implementing, testing, etc.",
      inputSchema: UpdateStatusSchema,
    },
    {
      name: TOOL_NAMES.ESCALATE,
      description:
        "Escalate questions or issues to the user. Use this when you need " +
        "clarification or are blocked. Set blocking=true if you cannot proceed " +
        "without an answer.",
      inputSchema: EscalateSchema,
    },
  ];
}

/**
 * MCP result content type (with index signature for SDK compatibility)
 */
interface McpResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
}

/**
 * Handler functions type
 */
interface JiratownHandlers {
  getNotifications: () => McpResult;
  acknowledge: (input: AcknowledgeInput) => McpResult;
  updateStatus: (input: UpdateStatusInput) => McpResult;
  escalate: (input: EscalateInput) => McpResult;
}

/**
 * Create Jiratown MCP server instance
 *
 * @param db - SQLite database instance
 * @param ticketId - ID of the ticket this server is for
 * @returns MCP server and handler functions
 */
export function createJiratownServer(
  db: Database,
  ticketId: string
): { server: McpServer; handlers: JiratownHandlers } {
  const server = new McpServer({
    name: "jiratown",
    version: "1.0.0",
  });

  // Create handler wrappers that format responses for MCP
  const handlers: JiratownHandlers = {
    getNotifications: () => {
      const result = handleGetNotifications(db, ticketId);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    },

    acknowledge: (input: AcknowledgeInput) => {
      const result = handleAcknowledge(db, input);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    },

    updateStatus: (input: UpdateStatusInput) => {
      const result = handleUpdateStatus(db, ticketId, input);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    },

    escalate: (input: EscalateInput) => {
      const result = handleEscalate(db, ticketId, input);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    },
  };

  // Register tools with the MCP server
  server.tool(
    TOOL_NAMES.GET_NOTIFICATIONS,
    "Get pending notifications for this ticket",
    GetNotificationsSchema.shape,
    () => handlers.getNotifications()
  );

  server.tool(
    TOOL_NAMES.ACKNOWLEDGE,
    "Acknowledge notifications after addressing them",
    AcknowledgeSchema.shape,
    (input) => handlers.acknowledge(input as AcknowledgeInput)
  );

  server.tool(
    TOOL_NAMES.UPDATE_STATUS,
    "Update the ticket's progress status",
    UpdateStatusSchema.shape,
    (input) => handlers.updateStatus(input as UpdateStatusInput)
  );

  server.tool(
    TOOL_NAMES.ESCALATE,
    "Escalate questions or issues to the user",
    EscalateSchema.shape,
    (input) => handlers.escalate(input as EscalateInput)
  );

  return { server, handlers };
}
