/**
 * Escalate tool definition.
 *
 * @module plugins/builtin/tools/definitions/escalate
 */
import type { OrchestratorTool } from "#workflow";

import { escalateToolImpl } from "../implementations";

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
