/**
 * Core plugin - registers built-in Jiratown tools.
 *
 * @module plugins/builtin/tools/plugin
 */

import { definePlugin } from "#plugins";
import { acknowledgeTool, escalateTool, updateStatusTool } from "./definitions.ts";

export const corePlugin = definePlugin({
  manifest: {
    name: "builtin-tools",
    version: "1.0.0",
    description: "Core Jiratown agent tools",
    capabilities: {
      tools: ["jiratown_acknowledge", "jiratown_update_status", "jiratown_escalate"],
    },
  },
  setup(ctx) {
    ctx.orchestrator.registerTool(acknowledgeTool);
    ctx.orchestrator.registerTool(updateStatusTool);
    ctx.orchestrator.registerTool(escalateTool);
  },
});
