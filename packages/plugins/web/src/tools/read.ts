/**
 * Web read tool — fetch URL content as LLM-friendly markdown.
 *
 * Wraps `jina read` CLI command.
 *
 * @module workhorse-plugin-web/tools/read
 */

import type {
  OrchestratorTool,
  ToolExecutionContext,
  ToolResult,
} from "workhorse-core";

import { execJina } from "../client.ts";

interface WebReadArgs {
  url: string;
  links?: boolean;
  images?: boolean;
  json?: boolean;
  timeout?: number;
}

export function createWebReadTool(): OrchestratorTool {
  return {
    name: "web_read",
    description: `Read a URL and extract clean markdown content.

Fetches content from any URL (web page, PDF, etc.) and returns LLM-friendly markdown.

Use cases:
- Read documentation for research
- Fetch article content for summarization
- Extract data from web pages
- Read PDF documents
- Analyze competitor websites

Wraps the \`jina read\` CLI command.`,
    schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to read (web page, PDF, etc.)",
        },
        links: {
          type: "boolean",
          description: "Include a summary of all links at the end",
        },
        images: {
          type: "boolean",
          description: "Include a summary of all images at the end",
        },
        json: {
          type: "boolean",
          description: "Return structured JSON output",
        },
        timeout: {
          type: "number",
          description: "Timeout in seconds (default: 60)",
        },
      },
      required: ["url"],
    },
    execute: async (
      args: unknown,
      _ctx: ToolExecutionContext,
    ): Promise<ToolResult> => {
      const { url, links, images, json, timeout } = args as WebReadArgs;

      const cliArgs = ["read", url];
      if (links) cliArgs.push("--links");
      if (images) cliArgs.push("--images");
      if (json) cliArgs.push("--json");

      const result = await execJina(cliArgs, {
        timeout: (timeout ?? 60) * 1000,
      });

      if (!result.success) {
        return {
          success: false,
          error:
            result.stderr ||
            `jina read failed with exit code ${result.exitCode}`,
        };
      }

      return {
        success: true,
        output: result.stdout,
      };
    },
  };
}
