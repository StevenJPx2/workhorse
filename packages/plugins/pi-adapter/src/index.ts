/**
 * Pi Coding Agent adapter plugin.
 *
 * Standalone plugin package that wraps @mariozechner/pi-coding-agent
 * for use with Jiratown's orchestrator.
 *
 * @module @jiratown/plugin-pi-adapter
 */

import { definePlugin } from "@jiratown/core";
import { PiAgentAdapter } from "./adapter.ts";

export { PiAgentAdapter } from "./adapter.ts";

export const piAdapterPlugin = definePlugin({
  manifest: {
    name: "pi-adapter",
    version: "1.0.0",
    description: "Pi Coding Agent adapter",
    capabilities: {
      adapters: ["pi-coding-agent"],
    },
  },
  setup(ctx) {
    ctx.orchestrator.registerAdapter("pi-coding-agent", PiAgentAdapter);
  },
});
