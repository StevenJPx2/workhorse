/**
 * Playwright Click Tool
 *
 * @module @jiratown/plugin-playwright/tools/click
 */

import type { OrchestratorTool } from "@jiratown/core";
import { click } from "../session-operations.ts";
import type { PlaywrightSessionManager } from "../session-manager.ts";

/** Create the playwright_click tool */
export function createClickTool(sessionManager: PlaywrightSessionManager): OrchestratorTool {
  return {
    name: "playwright_click",
    description:
      "Click an element on the current page. Use CSS selectors to identify the target element. " +
      "Requires a page to be loaded first using playwright_navigate.",
    schema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            "CSS selector for the element to click (e.g., 'button.submit', '#login-btn', 'a[href=\"/about\"]')",
        },
      },
      required: ["selector"],
    },
    execute: async (args, ctx) => {
      const { selector } = args as { selector: string };

      const result = await click(sessionManager, ctx.issueId, selector);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return {
        success: true,
        output: `Clicked element: ${selector}`,
      };
    },
  };
}
