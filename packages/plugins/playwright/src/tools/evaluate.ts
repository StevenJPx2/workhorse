/**
 * Playwright Evaluate Tool
 *
 * @module @jiratown/plugin-playwright/tools/evaluate
 */

import type { OrchestratorTool } from "@jiratown/core";
import { evaluate } from "../session-operations.ts";
import type { PlaywrightSessionManager } from "../session-manager.ts";

/** Create the playwright_evaluate tool */
export function createEvaluateTool(sessionManager: PlaywrightSessionManager): OrchestratorTool {
  return {
    name: "playwright_evaluate",
    description:
      "Evaluate a JavaScript expression in the browser context. " +
      "The expression runs in the page and has access to the DOM. " +
      "Use this for complex queries or DOM manipulation that can't be done with other tools.",
    schema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description:
            "JavaScript expression to evaluate (e.g., 'document.querySelectorAll(\"a\").length', " +
            "'localStorage.getItem(\"token\")', 'window.location.href')",
        },
      },
      required: ["expression"],
    },
    execute: async (args, ctx) => {
      const { expression } = args as { expression: string };

      const result = await evaluate(sessionManager, ctx.issueId, expression);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Format result for display
      let output: string;
      if (result.result === undefined) {
        output = "undefined";
      } else if (result.result === null) {
        output = "null";
      } else if (typeof result.result === "object") {
        output = JSON.stringify(result.result, null, 2);
      } else {
        output = String(result.result);
      }

      return {
        success: true,
        output: `Result: ${output}`,
      };
    },
  };
}
