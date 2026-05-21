/**
 * Escalate tool implementation.
 *
 * @module plugins/builtin/tools/implementations/escalate
 */
import type { ToolExecutionContext, ToolResult } from "#workflow";

/**
 * Escalate to a human when blocked or need clarification.
 */
export async function escalateToolImpl(
  args: unknown,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  try {
    const { message, blocking = false } = args as {
      message: string;
      blocking?: boolean;
    };

    // Find issue
    const issue = await ctx.db.issues.getByExternalId(ctx.issueId);

    if (!issue) {
      return {
        success: false,
        error: `Issue not found: ${ctx.issueId}`,
      };
    }

    // Create escalation notification
    // Priority: "blocking" for blocking escalations, "high" for non-blocking
    await ctx.db.notifications.create({
      issueId: issue.id,
      source: "agent",
      priority: blocking ? "blocking" : "high",
      title: blocking ? "Agent Blocked - Needs Assistance" : "Agent Escalation",
      body: message,
      metadata: {
        type: "escalation",
        blocking,
      },
    });

    // If blocking, update status to blocked
    if (blocking) {
      ctx.hooks.emit("issue.status_changed", {
        issue: { ...issue, status: "blocked" },
        from: issue.status,
        to: "blocked",
      });
      await ctx.db.issues.updateStatus(issue.id, "blocked");
    }

    return {
      success: true,
      output: blocking
        ? "Escalation created. Status changed to 'blocked'. Waiting for human response."
        : "Escalation created. Human has been notified.",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
