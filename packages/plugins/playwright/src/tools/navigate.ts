/**
 * Playwright Navigate Tool
 *
 * @module workhorse-plugin-playwright/tools/navigate
 */
import type { OrchestratorTool } from "workhorse-core";

import type { PlaywrightSessionManager } from "../session-manager.ts";

/** Create the playwright_navigate tool */
export function createNavigateTool(
  sessionManager: PlaywrightSessionManager,
): OrchestratorTool {
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
          description:
            "The URL to navigate to (must be a valid http:// or https:// URL)",
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
        ignoreHTTPSErrors: {
          type: "boolean",
          description:
            "Ignore HTTPS errors (e.g., self-signed certificates). If the session was created without this option and you set it to true, the session will be recreated. Default: false",
        },
        extraHTTPHeaders: {
          type: "object",
          additionalProperties: { type: "string" },
          description:
            'Extra HTTP headers to send with every request (e.g., {"User-Agent": "MyBot/1.0", "Authorization": "Bearer token"}). Applied before navigation.',
        },
      },
      required: ["url"],
    },
    execute: async (args, ctx) => {
      const { url, waitUntil, timeout, ignoreHTTPSErrors, extraHTTPHeaders } =
        args as {
          url: string;
          waitUntil?: "load" | "domcontentloaded" | "networkidle";
          timeout?: number;
          ignoreHTTPSErrors?: boolean;
          extraHTTPHeaders?: Record<string, string>;
        };

      // Validate URL
      try {
        new URL(url);
      } catch {
        return { success: false, error: `Invalid URL: ${url}` };
      }

      const result = await sessionManager.navigate(ctx.issueId, url, {
        waitUntil,
        timeout,
        ignoreHTTPSErrors,
        extraHTTPHeaders,
      });

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
