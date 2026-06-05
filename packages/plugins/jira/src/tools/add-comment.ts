/**
 * Jira Add Comment tool.
 *
 * @module workhorse-plugin-jira/tools/add-comment
 */
import { type OrchestratorTool, withWorkhorseFooter } from "workhorse-core";

import type { AtlassianClient } from "../client.ts";
import type { Hooks } from "./types.ts";

/** Tool: Add a comment to a Jira issue */
export function createAddCommentTool(
  client: AtlassianClient,
  hooks: Hooks,
): OrchestratorTool {
  return {
    name: "jira_add_comment",
    description:
      "Add a comment to a Jira issue. Use this to provide updates, ask questions, " +
      "or share findings with the Jira ticket stakeholders. " +
      "When responding to a Jira comment notification, use reply_to_id from the notification " +
      "metadata as replyToId to reply in the same thread. " +
      "Do NOT include any footer or signature - one is added automatically.",
    sources: ["jira"],
    schema: {
      type: "object",
      properties: {
        body: {
          type: "string",
          description: "The comment body in plain text or markdown",
        },
        replyToId: {
          type: "string",
          description:
            "The ID of the parent comment to reply to. Use reply_to_id from the notification " +
            "metadata to reply in the same thread. Omit for a new top-level comment.",
        },
      },
      required: ["body"],
    },
    execute: async (args, ctx) => {
      const { body, replyToId } = args as {
        body: string;
        replyToId?: string;
      };
      try {
        // Check if current issue is from Jira
        // Note: ctx.issueId is the externalId (e.g., "ADEPT-37943"), not the internal UUID
        const issue = await ctx.db.issues.getByExternalId(ctx.issueId, "jira");
        if (!issue) {
          return {
            success: false,
            error: "This tool only works for Jira-sourced issues",
          };
        }

        const ticketKey = issue.externalId;
        await client.addComment(
          ticketKey,
          withWorkhorseFooter(body),
          replyToId,
        );

        // Emit hook for cross-plugin coordination
        // Note: We don't have the comment ID from addComment response, so we use a timestamp-based ID
        hooks.emit("jira:comment.added", {
          issueId: ticketKey,
          comment: {
            id: `comment-${Date.now()}`,
            author: "workhorse-agent",
            body,
          },
        });

        return {
          success: true,
          output: `Comment added to ${ticketKey}${replyToId ? ` (reply to comment ${replyToId})` : ""}`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
