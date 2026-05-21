/**
 * Update status tool definition.
 *
 * @module plugins/builtin/tools/definitions/update-status
 */
import type { OrchestratorTool } from "#workflow";

import { updateStatusToolImpl } from "../implementations";

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
        enum: [
          "pending",
          "queued",
          "planning",
          "implementing",
          "blocked",
          "in_review",
          "done",
        ],
        description: "The new status for the issue",
      },
    },
    required: ["status"],
  },
  execute: updateStatusToolImpl,
};
