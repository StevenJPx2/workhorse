/**
 * Figma Plugin — Workhorse plugin for Figma design file integration.
 *
 * Provides:
 * - Cross-plugin link discovery (detects Figma URLs in Jira tickets, etc.)
 * - Prompt enrichment (file structure, frames, components, styles)
 * - Figma tools: figma_get_file, figma_get_comments, figma_post_comment
 * - TUI renderer for Figma notifications and tool calls
 *
 * Note: This plugin does NOT provide a parser. Figma URLs are design references,
 * not tasks. They are discovered via the issue.links.discovered hook when other
 * plugins (e.g., Jira) parse issues containing Figma URLs.
 *
 * @module workhorse-plugin-figma
 */

import { definePlugin } from "workhorse-core";

import { FigmaClient } from "./client.ts";
import { createCredentialGetter } from "./credentials.ts";
import { registerCrossPluginHandlers } from "./cross-plugin.ts";
import { registerPromptHooks } from "./prompt.ts";
import { figmaRenderer } from "./renderer.ts";
import { createFigmaTools } from "./tools";

// Re-exports for consumers

export type { FigmaCredentials, FigmaFile, FigmaComment, FigmaRef } from "./types.ts";
export { canParseFigma, extractFigmaRef } from "./parser.ts";
export { isFigmaAuthenticated } from "./credentials.ts";

// Plugin definition

export const figmaPlugin = definePlugin({
  manifest: {
    name: "figma",
    version: "1.0.0",
    description: "Figma design file integration for Workhorse",
    capabilities: {
      // No parsers — Figma URLs are references, not tasks
      // They're discovered via issue.links.discovered from other plugins
      tools: ["figma_get_file", "figma_get_comments", "figma_post_comment"],
    },
  },

  setup(ctx) {
    // Create Figma API client (reads PAT from env / keychain at call time)
    const client = new FigmaClient(createCredentialGetter());

    // Listen for Figma URLs discovered in other plugins (e.g., Jira ticket descriptions)
    // This enables automatic design context when a Jira ticket links to a Figma file
    registerCrossPluginHandlers(ctx.hooks, client);

    // Register prompt enrichment (injects linked design context into agent's system prompt)
    registerPromptHooks(ctx, client);

    // Register Figma tools with the orchestrator
    for (const tool of createFigmaTools(client)) {
      ctx.orchestrator.registerTool(tool);
    }

    // Register TUI renderer for Figma notifications and tool calls
    ctx.hooks.emit("tui.register_renderer", {
      id: "figma",
      renderer: figmaRenderer,
      priority: 10,
    });
  },

  teardown() {
    // Hooks are cleaned up automatically by the framework.
  },
});
