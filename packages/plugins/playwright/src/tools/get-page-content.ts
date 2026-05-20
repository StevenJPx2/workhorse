/**
 * Playwright Get Page Content Tool
 *
 * @module workhorse-plugin-playwright/tools/get-page-content
 */

import type { OrchestratorTool } from "workhorse-core";

import type { PlaywrightSessionManager } from "../session-manager.ts";
import { getContent } from "../session-operations.ts";

/** Create the playwright_get_page_content tool */
export function createGetPageContentTool(
  sessionManager: PlaywrightSessionManager,
): OrchestratorTool {
  return {
    name: "playwright_get_page_content",
    description:
      "Get the HTML content of the current page. Returns the full page HTML including the <html> tag. " +
      "Useful for parsing page structure or extracting data. For large pages, the content may be truncated.",
    schema: {
      type: "object",
      properties: {
        maxLength: {
          type: "number",
          description: "Maximum characters to return (default: 50000)",
        },
      },
      required: [],
    },
    execute: async (args, ctx) => {
      const { maxLength = 50000 } = args as { maxLength?: number };

      const result = await getContent(sessionManager, ctx.issueId);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      let content = result.content!;

      if (content.length > maxLength) {
        return {
          success: true,
          output: `${content.slice(0, maxLength)}\n\n[Truncated: showing ${maxLength} of ${content.length} characters]`,
        };
      }

      return {
        success: true,
        output: content,
      };
    },
  };
}
