import { definePlugin, useJiratown } from "@jiratown/core";
import { registerRenderer, type RegisterRendererPayload } from "./renderers";

/**
 * TUI plugin definition.
 *
 * This plugin registers the tui.register_renderer hook handler,
 * allowing other plugins (Jira, GitHub) to register notification renderers.
 */
export default definePlugin({
  manifest: {
    name: "tui",
    version: "0.1.0",
    description: "Terminal UI for Jiratown",
  },
  setup() {
    const { hooks } = useJiratown();

    // Register hook for other plugins to add notification renderers
    hooks.on("tui.register_renderer", (payload: RegisterRendererPayload) => {
      registerRenderer(payload.type, payload.renderer);
    });
  },
});
