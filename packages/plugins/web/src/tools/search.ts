/**
 * Web search tool — search the web and return results with content.
 *
 * Wraps `jina search` CLI command.
 *
 * @module workhorse-plugin-web/tools/search
 */

import type { OrchestratorTool, ToolExecutionContext, ToolResult } from "workhorse-core";

import { execJina } from "../client.ts";

interface WebSearchArgs {
  query: string;
  count?: number;
  arxiv?: boolean;
  images?: boolean;
  time?: "d" | "w" | "m" | "y";
  json?: boolean;
}

export function createWebSearchTool(): OrchestratorTool {
  return {
    name: "web_search",
    description: `Search the web and return results with content.

Performs a web search and returns results with their content as markdown.

Use cases:
- Research current events or recent information
- Find documentation or tutorials
- Look up facts or statistics
- Discover relevant resources
- Search academic papers (--arxiv)
- Find images (--images)

Wraps the \`jina search\` CLI command. Requires JINA_API_KEY.`,
    schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (be specific for better results)",
        },
        count: {
          type: "number",
          description: "Number of results (default: 5, max: 10)",
        },
        arxiv: {
          type: "boolean",
          description: "Search arXiv papers instead of web",
        },
        images: {
          type: "boolean",
          description: "Search for images instead of web pages",
        },
        time: {
          type: "string",
          enum: ["d", "w", "m", "y"],
          description: "Time filter: d=day, w=week, m=month, y=year",
        },
        json: {
          type: "boolean",
          description: "Return structured JSON output",
        },
      },
      required: ["query"],
    },
    execute: async (args: unknown, _ctx: ToolExecutionContext): Promise<ToolResult> => {
      const { query, count, arxiv, images, time, json } = args as WebSearchArgs;

      const cliArgs = ["search", query];
      if (count) cliArgs.push("-n", String(Math.min(count, 10)));
      if (arxiv) cliArgs.push("--arxiv");
      if (images) cliArgs.push("--images");
      if (time) cliArgs.push("--time", time);
      if (json) cliArgs.push("--json");

      const result = await execJina(cliArgs, { timeout: 30_000 });

      if (!result.success) {
        return {
          success: false,
          error: result.stderr || `jina search failed with exit code ${result.exitCode}`,
        };
      }

      return {
        success: true,
        output: result.stdout,
      };
    },
  };
}
