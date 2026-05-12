import { definePlugin, useJiratown } from "@jiratown/core";
import {
  registerRenderer,
  type RegisterRendererPayload,
  type ActivityInput,
  type RenderedActivity,
} from "./renderers";
import { agentRenderer } from "./renderers/agent.ts";

/**
 * TUI plugin definition.
 *
 * This plugin:
 * - Registers built-in renderer for agent notifications
 * - Provides a hook for other plugins to register their renderers
 */
export default definePlugin({
  manifest: {
    name: "tui",
    version: "0.1.0",
    description: "Terminal UI for Jiratown",
  },
  setup() {
    const { hooks } = useJiratown();

    // Register built-in renderer for agent notifications
    registerRenderer("agent", agentRenderer);

    // Allow plugins to register their own renderers via hook
    hooks.on("tui.register_renderer", (payload) => {
      const { id, renderer, priority } = payload as RegisterRendererPayload;
      registerRenderer(id, renderer as (input: ActivityInput) => RenderedActivity | null, priority);
    });
  },
});
