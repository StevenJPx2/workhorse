/**
 * Memory search tool implementation.
 *
 * @module plugins/builtin/tools/implementations/memory-search
 */

import type { ToolExecutionContext, ToolResult } from "#workflow";

/**
 * Search the L2 semantic memory for relevant context.
 */
export async function memorySearchToolImpl(
  args: unknown,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  try {
    const {
      query,
      limit = 5,
      type,
      includeContent = true,
    } = args as {
      query: string;
      limit?: number;
      type?: string;
      includeContent?: boolean;
    };

    if (!query || query.trim().length === 0) {
      return {
        success: false,
        error: "Query is required and cannot be empty",
      };
    }

    const results = await ctx.memory.l2.search(query, {
      limit,
      filter: type ? { type } : undefined,
      returnContent: includeContent,
    });

    if (results.length === 0) {
      return {
        success: true,
        output: "No matching documents found in memory.",
      };
    }

    return {
      success: true,
      output: `Found ${results.length} result(s):\n\n${results
        .map((r, i) => {
          const parts = [
            `## Result ${i + 1} (score: ${r.score.toFixed(3)})`,
            `**ID:** ${r.id}`,
          ];

          if (r.metadata) {
            if (r.metadata.type) parts.push(`**Type:** ${r.metadata.type}`);
            if (r.metadata.issueId)
              parts.push(`**Issue:** ${r.metadata.issueId}`);
            if (r.metadata.source)
              parts.push(`**Source:** ${r.metadata.source}`);
          }

          if (r.content) {
            parts.push("", "**Content:**", r.content);
          }

          return parts.join("\n");
        })
        .join("\n\n---\n\n")}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
