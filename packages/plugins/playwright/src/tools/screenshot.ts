/**
 * Playwright Screenshot Tool
 *
 * @module @jiratown/plugin-playwright/tools/screenshot
 */

import { join } from "node:path";
import type { OrchestratorTool } from "@jiratown/core";
import { screenshot } from "../session-operations.ts";
import type { PlaywrightSessionManager } from "../session-manager.ts";

/** Create the playwright_screenshot tool */
export function createScreenshotTool(sessionManager: PlaywrightSessionManager): OrchestratorTool {
  return {
    name: "playwright_screenshot",
    description:
      "Take a screenshot of the current page in the browser session. " +
      "Requires a page to be loaded first using playwright_navigate. " +
      "Screenshots are saved to the worktree directory.",
    schema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Output filename (default: screenshot-{timestamp}.png)",
        },
        fullPage: {
          type: "boolean",
          description: "Capture the full scrollable page (default: false)",
        },
        format: {
          type: "string",
          enum: ["png", "jpeg"],
          description: "Image format (default: png)",
        },
        quality: {
          type: "number",
          description: "JPEG quality 0-100 (only for jpeg format)",
        },
      },
      required: [],
    },
    execute: async (args, ctx) => {
      const { filename, fullPage, format, quality } = args as {
        filename?: string;
        fullPage?: boolean;
        format?: "png" | "jpeg";
        quality?: number;
      };

      const outputFilename = filename || `screenshot-${Date.now()}.${format || "png"}`;

      const result = await screenshot(
        sessionManager,
        ctx.issueId,
        join(ctx.worktreePath, outputFilename),
        {
          fullPage,
          format,
          quality,
        },
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return {
        success: true,
        output: `Screenshot saved to: ${outputFilename}${fullPage ? " (full page)" : ""}`,
      };
    },
  };
}
