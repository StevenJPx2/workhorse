/**
 * Pi Coding Agent adapter plugin.
 *
 * Standalone plugin package that wraps @earendil-works/pi-coding-agent
 * for use with Jiratown's orchestrator.
 *
 * @module workhorse-plugin-pi-adapter
 */

import { definePlugin } from "workhorse-core";
import { PiAgentAdapter } from "./adapter.ts";
import { piToolRenderer } from "./renderers.ts";

export { PiAgentAdapter } from "./adapter.ts";
export { PiAdapterModelRegistry } from "./registry.ts";
export type { ModelInfo } from "workhorse-core";

// Re-export bash restrictions
export {
  createRestrictedBashOperations,
  createRestrictedBashConfig,
  createPathValidatingSpawnHook,
  type RestrictedBashOptions,
  type RestrictedBashToolConfig,
} from "./bash-restriction.ts";

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

    // Register PI tool renderers with TUI (if TUI plugin is loaded)
    ctx.hooks.emit("tui.register_renderer", {
      id: "pi-tools",
      renderer: piToolRenderer,
    });
  },
});
