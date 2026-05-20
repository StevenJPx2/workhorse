/**
 * Web Plugin — Workhorse plugin for web operations via Jina AI.
 *
 * Provides:
 * - web_read: Extract markdown from URLs (web pages, PDFs)
 * - web_search: Search the web with content extraction
 * - web_screenshot: Capture screenshots of web pages
 *
 * **External deps:** `jina-cli` Python package (`pip install jina-cli`)
 * **Environment:** `JINA_API_KEY` for search operations
 *
 * @see https://github.com/jina-ai/cli
 * @module workhorse-plugin-web
 */

import { z } from "zod/v4";
import { definePlugin } from "workhorse-core";
import { checkJinaInstalled, hasApiKey } from "./client.ts";
import { webRenderer } from "./renderer.ts";
import { createWebTools } from "./tools";

/** Config schema for the web plugin */
export const WebConfigSchema = z.object({
  /** Jina API key (defaults to JINA_API_KEY env var) */
  apiKey: z.string().optional(),
  /** Warn if jina-cli is not installed */
  warnIfMissing: z.boolean().default(true),
});

export type WebConfig = z.infer<typeof WebConfigSchema>;

export const webPlugin = definePlugin({
  manifest: {
    name: "web",
    version: "1.0.0",
    description: "Web operations via Jina AI (read, search, screenshot)",
    capabilities: {
      tools: ["web_read", "web_search", "web_screenshot"],
    },
  },
  configSchema: WebConfigSchema,
  async setup(ctx, config) {
    // Set API key from config if provided
    if (config.apiKey && !process.env.JINA_API_KEY) {
      process.env.JINA_API_KEY = config.apiKey;
    }

    // Check if jina-cli is installed
    if (!(await checkJinaInstalled())) {
      if (config.warnIfMissing) {
        console.warn("[web] jina-cli not found. Install with: pip install jina-cli");
      }
      // Don't fail - tools will return helpful errors when invoked
    }

    // Warn if no API key for search
    if (!hasApiKey()) {
      console.warn("[web] JINA_API_KEY not set. web_search requires an API key.");
    }

    // Register tools
    for (const tool of createWebTools()) {
      ctx.orchestrator.registerTool(tool);
    }

    // Register TUI renderer
    ctx.hooks.emit("tui.register_renderer", {
      id: "web",
      renderer: webRenderer,
      priority: 5,
    });
  },
});

// Default export for easy importing
export default webPlugin;

// Named exports
export { checkJinaInstalled, hasApiKey, execJina } from "./client.ts";
export {
  createWebTools,
  createWebReadTool,
  createWebSearchTool,
  createScreenshotTool,
} from "./tools";
export { webRenderer } from "./renderer.ts";
