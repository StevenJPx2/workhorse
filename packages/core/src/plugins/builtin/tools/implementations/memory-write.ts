/**
 * Memory write tool implementation.
 *
 * @module plugins/builtin/tools/implementations/memory-write
 */

import type { ToolExecutionContext, ToolResult } from "#workflow/orchestrator";

/**
 * Write a session summary, patterns, and learnings to L1 memory.
 */
export async function memoryWriteToolImpl(
  args: unknown,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  try {
    const {
      summary = [],
      patterns,
      learnings = [],
      filesChanged = [],
    } = args as {
      summary?: string[];
      patterns?: string[];
      learnings?: string[];
      filesChanged?: string[];
    };

    const l1 = ctx.memory.l1.get(ctx.issueId);
    if (!l1?.exists()) {
      return {
        success: false,
        error: `No session memory found for issue ${ctx.issueId}`,
      };
    }

    // Append a session entry if there's anything to record
    const hasSummary = summary.length > 0 || learnings.length > 0 || filesChanged.length > 0;
    if (hasSummary) {
      const currentMemory = await l1.read();
      if (!currentMemory) {
        return { success: false, error: "Failed to read session memory" };
      }
      await l1.appendSession({
        timestamp: new Date(),
        status: currentMemory.latestStatus,
        summary: summary.length > 0 ? summary : ["Session checkpoint"],
        learnings,
        filesChanged,
      });
    }

    // Update patterns if provided (replaces the full list)
    if (patterns !== undefined) {
      await l1.updatePatterns(patterns);
    }

    const parts: string[] = [];
    if (hasSummary)
      parts.push(
        `session entry (${summary.length} summary items, ${learnings.length} learnings, ${filesChanged.length} files)`,
      );
    if (patterns !== undefined) parts.push(`${patterns.length} patterns`);

    return {
      success: true,
      output: `Memory updated: ${parts.join(", ")}.`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
