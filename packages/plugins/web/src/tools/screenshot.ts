/**
 * Screenshot tool — capture screenshots of web pages.
 *
 * Wraps `jina screenshot` CLI command.
 *
 * @module workhorse-plugin-web/tools/screenshot
 */
import type {
  OrchestratorTool,
  ToolExecutionContext,
  ToolResult,
} from "workhorse-core";

import { execJina } from "../client.ts";

interface ScreenshotArgs {
  url: string;
  output?: string;
  fullPage?: boolean;
}

export function createScreenshotTool(): OrchestratorTool {
  return {
    name: "web_screenshot",
    description: `Capture a screenshot of a web page.

Takes a screenshot of the specified URL and returns the image URL or saves to file.

Use cases:
- Document visual state of a web page
- Capture UI for bug reports
- Archive web page appearance
- Visual verification of changes

Wraps the \`jina screenshot\` CLI command.`,
    schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to screenshot",
        },
        output: {
          type: "string",
          description:
            "Output file path (e.g., 'page.png'). If omitted, returns URL.",
        },
        fullPage: {
          type: "boolean",
          description: "Capture full scrollable page instead of viewport",
        },
      },
      required: ["url"],
    },
    execute: async (
      args: unknown,
      _ctx: ToolExecutionContext,
    ): Promise<ToolResult> => {
      const { url, output, fullPage } = args as ScreenshotArgs;

      const cliArgs = ["screenshot", url];
      if (output) cliArgs.push("-o", output);
      if (fullPage) cliArgs.push("--full-page");

      const result = await execJina(cliArgs, { timeout: 30_000 });

      if (!result.success) {
        return {
          success: false,
          error:
            result.stderr ||
            `jina screenshot failed with exit code ${result.exitCode}`,
        };
      }

      return {
        success: true,
        output: output ? `Screenshot saved to ${output}` : result.stdout,
      };
    },
  };
}
