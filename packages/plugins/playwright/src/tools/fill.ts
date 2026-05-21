/**
 * Playwright Fill Tool
 *
 * @module workhorse-plugin-playwright/tools/fill
 */

import type { OrchestratorTool } from "workhorse-core";

import type { PlaywrightSessionManager } from "../session-manager.ts";
import { fill } from "../session-operations.ts";

/** Create the playwright_fill tool */
export function createFillTool(
  sessionManager: PlaywrightSessionManager,
): OrchestratorTool {
  return {
    name: "playwright_fill",
    description:
      "Fill a form input field on the current page. Use CSS selectors to identify the target element. " +
      "Requires a page to be loaded first using playwright_navigate.",
    schema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            "CSS selector for the input field (e.g., 'input[name=\"email\"]', '#password', '.search-input')",
        },
        value: {
          type: "string",
          description: "The value to fill into the field",
        },
      },
      required: ["selector", "value"],
    },
    execute: async (args, ctx) => {
      const { selector, value } = args as { selector: string; value: string };

      const result = await fill(sessionManager, ctx.issueId, selector, value);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return {
        success: true,
        output: `Filled "${selector}" with value (${value.length} chars)`,
      };
    },
  };
}
