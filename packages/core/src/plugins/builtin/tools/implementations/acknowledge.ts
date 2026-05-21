/**
 * Acknowledge tool implementation.
 *
 * @module plugins/builtin/tools/implementations/acknowledge
 */
import type { ToolExecutionContext, ToolResult } from "#workflow";

/**
 * Mark notifications as read.
 * Called by agents after processing system inbox messages.
 */
export async function acknowledgeToolImpl(
  args: unknown,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  try {
    const { notificationIds } = args as { notificationIds?: string[] };

    if (!notificationIds || notificationIds.length === 0) {
      // Mark all unread notifications for this issue as read
      // issueId in ToolExecutionContext is the externalId, so find by that
      const issue = await ctx.db.issues.getByExternalId(ctx.issueId);

      if (issue) {
        const notifications = await ctx.db.notifications.getUnread(issue.id);
        for (const notification of notifications) {
          await ctx.db.notifications.markRead(notification.id);
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
      await ctx.db.notifications.markRead(id);
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
}
