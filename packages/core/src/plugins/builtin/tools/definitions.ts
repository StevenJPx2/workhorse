/**
 * Tool definitions (schemas and metadata).
 *
 * @module plugins/builtin/tools/definitions
 */

import type { OrchestratorTool } from "#workflow/orchestrator";
import { acknowledgeToolImpl, escalateToolImpl, updateStatusToolImpl } from "./implementations.ts";

export const acknowledgeTool: OrchestratorTool = {
  name: "workhorse_acknowledge",
  description:
    "Mark notification(s) as read. Call this after processing system inbox messages. " +
    "If notificationIds is omitted, all unread notifications for the current issue are acknowledged.",
  schema: {
    type: "object",
    properties: {
      notificationIds: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional list of notification IDs to acknowledge. If omitted, acknowledges all.",
      },
    },
  },
  execute: acknowledgeToolImpl,
};

export const updateStatusTool: OrchestratorTool = {
  name: "workhorse_update_status",
  description:
    "Update the current issue's status. Use this to reflect progress: " +
    "'planning' when analyzing requirements, 'implementing' when coding, " +
    "'in_review' when awaiting review, 'blocked' when stuck, 'done' when complete.",
  schema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["pending", "queued", "planning", "implementing", "blocked", "in_review", "done"],
        description: "The new status for the issue",
      },
    },
    required: ["status"],
  },
  execute: updateStatusToolImpl,
};

export const escalateTool: OrchestratorTool = {
  name: "workhorse_escalate",
  description:
    "Escalate to a human when blocked or need clarification. " +
    "Set blocking=true if you cannot proceed without a response. " +
    "This creates a notification and optionally updates status to 'blocked'.",
  schema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "Description of the issue or question for the human",
      },
      blocking: {
        type: "boolean",
        description: "Whether this blocks further progress. Defaults to false.",
      },
    },
    required: ["message"],
  },
  execute: escalateToolImpl,
};
