/**
 * Playwright Screenshot Tool
 *
 * Takes screenshots and stores them via AttachmentService for cross-plugin access.
 *
 * @module workhorse-plugin-playwright/tools/screenshot
 */

import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AttachmentService, OrchestratorTool } from "workhorse-core";
import { screenshot } from "../session-operations.ts";
import type { PlaywrightSessionManager } from "../session-manager.ts";

/** Create the playwright_screenshot tool */
export function createScreenshotTool(
  sessionManager: PlaywrightSessionManager,
  attachmentService?: AttachmentService,
): OrchestratorTool {
  return {
    name: "playwright_screenshot",
    description:
      "Take a screenshot of the current page in the browser session. " +
      "Requires a page to be loaded first using playwright_navigate. " +
      "Screenshots are saved to the attachments directory and can be referenced by other tools.",
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

      const ext = format || "png";
      const outputFilename = filename || `screenshot-${Date.now()}.${ext}`;

      // If we have an attachment service, save to attachments directory
      if (attachmentService) {
        // Take screenshot to a temp file first
        const tempPath = join(tmpdir(), `wh-screenshot-${Date.now()}.${ext}`);

        const result = await screenshot(sessionManager, ctx.issueId, tempPath, {
          fullPage,
          format,
          quality,
        });

        if (!result.success) {
          return { success: false, error: result.error };
        }

        try {
          // Read the screenshot and store via attachment service
          const content = readFileSync(tempPath);
          const stored = await ctx.db.issues
            .getById(ctx.issueId)
            .then((issue) => issue?.repository ?? "unknown")
            .then((repoIdentifier) =>
              attachmentService.store(repoIdentifier, ctx.issueId, content, {
                source: "playwright",
                sourceId: `screenshot-${Date.now()}`,
                filename: outputFilename,
                mimeType: ext === "jpeg" ? "image/jpeg" : "image/png",
                size: content.length,
              }),
            );

          // Clean up temp file
          unlinkSync(tempPath);

          return {
            success: true,
            output: JSON.stringify({
              message: `Screenshot saved${fullPage ? " (full page)" : ""}`,
              filename: outputFilename,
              localPath: stored.localPath,
              size: stored.size,
              mimeType: stored.mimeType,
            }),
          };
        } catch (error) {
          // Clean up temp file on error
          try {
            unlinkSync(tempPath);
          } catch {
            // Ignore cleanup errors
          }
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      // Fallback: save directly to worktree (legacy behavior)
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
