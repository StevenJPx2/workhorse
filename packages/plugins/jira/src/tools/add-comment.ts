/**
 * Jira Add Comment tool.
 *
 * @module @jiratown/plugin-jira/tools/add-comment
 */

import type { OrchestratorTool } from "@jiratown/core";
import type { AtlassianClient } from "../client.ts";
import type { Hooks } from "./types.ts";

/** Tool: Add a comment to a Jira issue */
export function createAddCommentTool(client: AtlassianClient, hooks: Hooks): OrchestratorTool {
  return {
    name: "jira_add_comment",
    description:
      "Add a comment to a Jira issue. Use this to provide updates, ask questions, " +
      "or share findings with the Jira ticket stakeholders. Optionally reply to an existing comment. " +
      "Only works for Jira-sourced issues.",
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
            "Optional: The ID of an existing comment to reply to. Get comment IDs from jira_get_comments.",
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
        const issue = await ctx.db.issues.getById(ctx.issueId);
        if (!issue || issue.source !== "jira") {
          return {
            success: false,
            error: "This tool only works for Jira-sourced issues",
          };
        }

        const ticketKey = issue.externalId;
        await client.addComment(ticketKey, body, replyToId);

        // Emit hook for cross-plugin coordination
        // Note: We don't have the comment ID from addComment response, so we use a timestamp-based ID
        hooks.emit("jira:comment.added", {
          issueId: ticketKey,
          comment: {
            id: `comment-${Date.now()}`,
            author: "jiratown-agent",
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
