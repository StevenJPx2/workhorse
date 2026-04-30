/**
 * Tool implementation functions.
 *
 * @module plugins/builtin/tools/implementations
 */

import type { ToolExecutionContext, ToolResult } from "#workflow/orchestrator";

/**
 * Mark notifications as read.
 * Called by agents after processing system inbox messages.
 */
export const acknowledgeToolImpl = async (
  args: unknown,
  ctx: ToolExecutionContext,
): Promise<ToolResult> => {
  try {
    const { notificationIds } = args as { notificationIds?: string[] };

    if (!notificationIds || notificationIds.length === 0) {
      // Mark all unread notifications for this issue as read
      // issueId in ToolExecutionContext is the externalId, so find by that
      const issue = ctx.db.issues.getAll().find((i) => i.externalId === ctx.issueId);
      if (issue) {
        const notifications = ctx.db.notifications.getUnread(issue.id);
        for (const notification of notifications) {
          ctx.db.notifications.markRead(notification.id);
        }
        return {
          success: true,
          output: `Acknowledged ${notifications.length} notification(s)`,
        };
      }
      return { success: true, output: "No notifications to acknowledge" };
    }

    // Mark specific notifications as read
    for (const id of notificationIds) {
      ctx.db.notifications.markRead(id);
    }

    return {
      success: true,
      output: `Acknowledged ${notificationIds.length} notification(s)`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Update the issue status.
 */
export const updateStatusToolImpl = async (
  args: unknown,
  ctx: ToolExecutionContext,
): Promise<ToolResult> => {
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
    const issue = ctx.db.issues.getAll().find((i) => i.externalId === ctx.issueId);

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
    ctx.db.issues.updateStatus(issue.id, status as typeof issue.status);

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
};

/**
 * Escalate to a human when blocked or need clarification.
 */
export const escalateToolImpl = async (
  args: unknown,
  ctx: ToolExecutionContext,
): Promise<ToolResult> => {
  try {
    const { message, blocking = false } = args as {
      message: string;
      blocking?: boolean;
    };

    // Find issue
    const issue = ctx.db.issues.getAll().find((i) => i.externalId === ctx.issueId);

    if (!issue) {
      return {
        success: false,
        error: `Issue not found: ${ctx.issueId}`,
      };
    }

    // Create escalation notification
    // Priority: "blocking" for blocking escalations, "high" for non-blocking
    ctx.db.notifications.create({
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
      ctx.db.issues.updateStatus(issue.id, "blocked");
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
};
