import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { z } from "zod";
import {
  handleGetNotifications,
  handleAcknowledge,
  handleUpdateStatus,
  handleEscalate,
  handleOpenPR,
} from "./tools/index.ts";
import type {
  AcknowledgeInput,
  UpdateStatusInput,
  EscalateInput,
  OpenPRInput,
  JiratownServerOptions,
} from "./types.ts";
import { TOOL_NAMES } from "./tool-names.ts";

const GetNotificationsSchema = z.object({});

const AcknowledgeSchema = z.object({
  notification_ids: z.array(z.string()).describe("IDs of notifications to acknowledge"),
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
        "'done' (complete)",
    ),
  message: z.string().optional().describe("Optional status update message"),
});

const EscalateSchema = z.object({
  questions: z.array(z.string()).min(1).describe("Questions to ask the user"),
  context: z.string().describe("Context about what you were working on"),
  blocking: z.boolean().describe("Whether this blocks further work on the ticket"),
});

const OpenPRSchema = z.object({
  title: z.string().describe("PR title (usually includes the Jira ticket key)"),
  body: z
    .string()
    .describe("PR body/description with summary of changes, what was implemented, and how to test"),
  base_branch: z.string().optional().describe("Base branch to merge into (defaults to 'main')"),
});

interface McpResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
}

interface AsyncMcpResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
}

interface JiratownHandlers {
  getNotifications: () => McpResult;
  acknowledge: (input: AcknowledgeInput) => McpResult;
  updateStatus: (input: UpdateStatusInput) => McpResult;
  escalate: (input: EscalateInput) => McpResult;
  openPR: (input: OpenPRInput) => Promise<AsyncMcpResult>;
}

export function createJiratownServer(
  db: Database,
  ticketId: string,
  options: JiratownServerOptions = {},
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

    openPR: async (input: OpenPRInput) => {
      const result = await handleOpenPR(db, ticketId, input);

      // Trigger callback when PR is successfully created with all required info
      if (result.success && result.pr_url && result.pr_number && result.owner && result.repo) {
        options.onPRCreated?.({
          ticketId,
          prUrl: result.pr_url,
          prNumber: result.pr_number,
          owner: result.owner,
          repo: result.repo,
        });
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    },
  };

  server.tool(
    TOOL_NAMES.GET_NOTIFICATIONS,
    "Get pending notifications for this ticket",
    GetNotificationsSchema.shape,
    () => handlers.getNotifications(),
  );

  server.tool(
    TOOL_NAMES.ACKNOWLEDGE,
    "Acknowledge notifications after addressing them",
    AcknowledgeSchema.shape,
    (input) => handlers.acknowledge(input as AcknowledgeInput),
  );

  server.tool(
    TOOL_NAMES.UPDATE_STATUS,
    "Update the ticket's progress status",
    UpdateStatusSchema.shape,
    (input) => handlers.updateStatus(input as UpdateStatusInput),
  );

  server.tool(
    TOOL_NAMES.ESCALATE,
    "Escalate questions or issues to the user",
    EscalateSchema.shape,
    (input) => handlers.escalate(input as EscalateInput),
  );

  server.tool(
    TOOL_NAMES.OPEN_PR,
    "Open a GitHub Pull Request for this ticket. Pushes current branch and creates PR via gh CLI. Automatically updates ticket status to pr_created.",
    OpenPRSchema.shape,
    async (input) => handlers.openPR(input as OpenPRInput),
  );

  return { server, handlers };
}
