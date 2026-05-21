/**
 * Update status tool implementation.
 *
 * @module plugins/builtin/tools/implementations/update-status
 */
import type { ToolExecutionContext, ToolResult } from "#workflow";

/**
 * Update the issue status.
 */
export async function updateStatusToolImpl(
  args: unknown,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  try {
    const { status } = args as { status: string };

    // Validate status (basic validation, could be more strict)
    // Note: VCS plugins can register additional statuses via hooks
    const validStatuses = [
      "pending",
      "queued",
      "planning",
      "implementing",
      "blocked",
      "in_review",
      "done",
    ];

    if (!validStatuses.includes(status)) {
      return {
        success: false,
        error: `Invalid status "${status}". Valid statuses: ${validStatuses.join(", ")}`,
      };
    }

    // Find issue by external ID
    const issue = await ctx.db.issues.getByExternalId(ctx.issueId);

    if (!issue) {
      return {
        success: false,
        error: `Issue not found: ${ctx.issueId}`,
      };
    }

    // Emit hook
    ctx.hooks.emit("issue.status_changed", {
      issue: { ...issue, status: status as typeof issue.status },
      from: issue.status,
      to: status as typeof issue.status,
    });

    // Update status
    await ctx.db.issues.updateStatus(issue.id, status as typeof issue.status);

    return {
      success: true,
      output: `Status updated from "${issue.status}" to "${status}"`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
