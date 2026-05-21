import {
  definePlugin,
  useWorkhorse,
  registerHookMetadata,
} from "workhorse-core";

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
 * - Registers hook metadata for documentation
 */
export default definePlugin({
  manifest: {
    name: "tui",
    version: "0.1.0",
    description: "Terminal UI for Workhorse",
  },
  setup() {
    const { hooks } = useWorkhorse();

    // Register hook metadata for documentation
    registerHookMetadata({
      name: "tui.register_renderer",
      category: "TUI",
      description:
        "Fired to register a custom TUI renderer for tools or notifications",
      payload: "{ id: string, renderer: ActivityRenderer, priority?: number }",
      plugin: "tui",
      example: `hooks.emit("tui.register_renderer", {
  id: "my-tool",
  renderer: (input) => ({
    icon: "🔧",
    color: "blue",
    title: "My Tool",
    body: input.args.message,
  }),
  priority: 50,
});`,
    });

    // Register built-in renderer for agent notifications
    registerRenderer("agent", agentRenderer);

    // Allow plugins to register their own renderers via hook
    hooks.on("tui.register_renderer", (payload) => {
      const { id, renderer, priority } = payload as RegisterRendererPayload;
      registerRenderer(
        id,
        renderer as (input: ActivityInput) => RenderedActivity | null,
        priority,
      );
    });
  },
});
