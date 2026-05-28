/**
 * Memory write tool implementation.
 *
 * @module plugins/builtin/tools/implementations/memory-write
 */
import type { ToolExecutionContext, ToolResult } from "#workflow";

/**
 * Write a session summary, patterns, and learnings to L1 memory.
 * Auto-creates the session memory if it doesn't exist yet.
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
    if (!l1) {
      return {
        success: false,
        error: `No worktree registered for issue ${ctx.issueId}`,
      };
    }

    // Auto-create session memory if it doesn't exist
    if (!l1.exists()) {
      const issue = await ctx.db.issues.getByExternalId(
        ctx.issueId,
        ctx.source,
      );
      if (!issue) {
        return {
          success: false,
          error: `Issue ${ctx.issueId} not found in database`,
        };
      }
      await l1.create(`${issue.externalId}: ${issue.title}`, issue.status);
    }

    const currentMemory = await l1.read();
    if (!currentMemory) {
      return { success: false, error: "Failed to read session memory" };
    }

    // Append a session entry if there's anything to record
    const hasSummary =
      summary.length > 0 || learnings.length > 0 || filesChanged.length > 0;
    if (hasSummary) {
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
