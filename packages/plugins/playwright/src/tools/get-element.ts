/**
 * Playwright Get Element Tool
 *
 * @module workhorse-plugin-playwright/tools/get-element
 */

import type { OrchestratorTool } from "workhorse-core";

import type { PlaywrightSessionManager } from "../session-manager.ts";
import { getElement } from "../session-operations.ts";

/** Create the playwright_get_element tool */
export function createGetElementTool(sessionManager: PlaywrightSessionManager): OrchestratorTool {
  return {
    name: "playwright_get_element",
    description:
      "Get information about an element on the current page. Returns whether the element exists, " +
      "its tag name, text content, and bounding box. Use this to verify element presence or state.",
    schema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the element to inspect",
        },
      },
      required: ["selector"],
    },
    execute: async (args, ctx) => {
      const { selector } = args as { selector: string };

      const result = await getElement(sessionManager, ctx.issueId, selector);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      const element = result.element!;
      if (!element.found) {
        return {
          success: true,
          output: `Element not found: ${selector}`,
        };
      }

      const parts = [`Element found: <${element.tagName}>`];
      if (element.textContent) {
        parts.push(
          `Text: "${element.textContent.slice(0, 100)}${element.textContent.length > 100 ? "..." : ""}"`,
        );
      }
      if (element.boundingBox) {
        const { x, y, width, height } = element.boundingBox;
        parts.push(`Position: (${x}, ${y}) Size: ${width}x${height}`);
      }

      return {
        success: true,
        output: parts.join("\n"),
      };
    },
  };
}
