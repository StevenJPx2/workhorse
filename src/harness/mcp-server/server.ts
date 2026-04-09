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
import { TOOL_NAMES } from "./tool-names.ts";

const GetNotificationsSchema = z.object({});

const AcknowledgeSchema = z.object({
  notification_ids: z
    .array(z.string())
    .describe("IDs of notifications to acknowledge"),
});

const UpdateStatusSchema = z.object({
  status: z
    .enum([
      "pending",
      "queued",
      "planning",
      "implementing",
      "blocked",
      "testing",
      "pr_created",
      "in_review",
      "done",
    ])
    .describe(
      "New status for the ticket workflow. Use: " +
      "'pending' (not started), 'planning' (analyzing requirements), " +
      "'implementing' (writing code), 'blocked' (needs input), " +
      "'pr_created' (PR opened), 'in_review' (awaiting review), " +
      "'done' (complete)"
    ),
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

interface McpResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
}

interface JiratownHandlers {
  getNotifications: () => McpResult;
  acknowledge: (input: AcknowledgeInput) => McpResult;
  updateStatus: (input: UpdateStatusInput) => McpResult;
  escalate: (input: EscalateInput) => McpResult;
}

export function createJiratownServer(
  db: Database,
  ticketId: string
): { server: McpServer; handlers: JiratownHandlers } {
  const server = new McpServer({
    name: "jiratown",
    version: "1.0.0",
  });

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