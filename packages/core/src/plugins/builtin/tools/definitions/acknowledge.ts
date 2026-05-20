/**
 * Acknowledge tool definition.
 *
 * @module plugins/builtin/tools/definitions/acknowledge
 */

import type { OrchestratorTool } from "#workflow/orchestrator";
import { acknowledgeToolImpl } from "../implementations";

export const acknowledgeTool: OrchestratorTool = {
  name: "workhorse_acknowledge",
  description:
    "Mark notification(s) as read. IMPORTANT: Only call this AFTER you have fully addressed the notification content. " +
    "For comments/questions, you must first respond or take the requested action. " +
    "For review feedback, you must first make the requested changes. " +
    "Do NOT acknowledge notifications without addressing them first. " +
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
