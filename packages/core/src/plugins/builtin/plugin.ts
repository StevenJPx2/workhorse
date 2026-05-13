/**
 * Core plugin - registers built-in Workhorse tools and local parser.
 *
 * @module plugins/builtin/tools/plugin
 */

// oxlint-disable-next-line workhorse/prefer-path-alias -- Vite build doesn't resolve path aliases
import { definePlugin } from "../define.ts";
import { createLocalParserOptions } from "./tools/parser.ts";
import { acknowledgeTool, escalateTool, updateStatusTool } from "./tools/definitions.ts";
import { notificationRenderer, workhorseToolRenderer } from "./renderers.ts";

export const corePlugin = definePlugin({
  manifest: {
    name: "builtin-tools",
    version: "1.0.0",
    description: "Core Workhorse agent tools and local issue parser",
    capabilities: {
      tools: ["workhorse_acknowledge", "workhorse_update_status", "workhorse_escalate"],
      parsers: ["local"],
    },
  },
  setup(ctx) {
    // Register tools
    ctx.orchestrator.registerTool(acknowledgeTool);
    ctx.orchestrator.registerTool(updateStatusTool);
    ctx.orchestrator.registerTool(escalateTool);

    // Register local parser as fallback (should be last, always matches)
    ctx.tracker.registerParser(createLocalParserOptions());

    // Register Workhorse tool renderers with TUI (if TUI plugin is loaded)
    ctx.hooks.emit("tui.register_renderer", {
      id: "workhorse-tools",
      renderer: workhorseToolRenderer,
    });

    // Register notification renderer with TUI
    ctx.hooks.emit("tui.register_renderer", {
      id: "workhorse-notifications",
      renderer: notificationRenderer,
    });
  },
});
