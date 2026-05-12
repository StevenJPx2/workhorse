/**
 * Playwright Navigate Tool
 *
 * @module @jiratown/plugin-playwright/tools/navigate
 */

import type { OrchestratorTool } from "@jiratown/core";
import type { PlaywrightSessionManager } from "../session-manager.ts";

/** Create the playwright_navigate tool */
export function createNavigateTool(sessionManager: PlaywrightSessionManager): OrchestratorTool {
  return {
    name: "playwright_navigate",
    description:
      "Navigate to a URL in a headless browser. Opens a new browser session if one doesn't exist. " +
      "Use this to load web pages for testing, scraping, or verification.",
    schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to navigate to (must be a valid http:// or https:// URL)",
        },
        waitUntil: {
          type: "string",
          enum: ["load", "domcontentloaded", "networkidle"],
          description: "When to consider navigation complete (default: load)",
        },
        timeout: {
          type: "number",
          description: "Navigation timeout in milliseconds (default: 30000)",
        },
      },
      required: ["url"],
    },
    execute: async (args, ctx) => {
      const { url, waitUntil, timeout } = args as {
        url: string;
        waitUntil?: "load" | "domcontentloaded" | "networkidle";
        timeout?: number;
      };

      // Validate URL
      try {
        new URL(url);
      } catch {
        return { success: false, error: `Invalid URL: ${url}` };
      }

      const result = await sessionManager.navigate(ctx.issueId, url, { waitUntil, timeout });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      const pageInfo = result.pageInfo!;
      return {
        success: true,
        output: `Navigated to: ${pageInfo.url}\nTitle: ${pageInfo.title}\nViewport: ${pageInfo.viewport.width}x${pageInfo.viewport.height}`,
      };
    },
  };
}
