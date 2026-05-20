/**
 * figma_post_comment tool — posts a comment on a Figma file.
 *
 * Allows the agent to ask questions, share status, or request designer
 * review directly inside the Figma file.
 *
 * @module workhorse-plugin-figma/tools/post-comment
 */

import type { OrchestratorTool } from "workhorse-core";

import type { FigmaClient } from "../client.ts";

/** Tool: Post a comment (or reply) on the Figma file */
export function createPostCommentTool(client: FigmaClient): OrchestratorTool {
  return {
    name: "figma_post_comment",
    description:
      "Post a comment on the Figma file linked to this issue. " +
      "Use this to ask the designer questions, confirm requirements, " +
      "or share implementation status. Optionally reply to an existing thread. " +
      "Only works for Figma-sourced issues.",
    schema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The comment text to post",
        },
        replyToId: {
          type: "string",
          description:
            "Optional: The ID of an existing comment to reply to. " +
            "Get comment IDs from figma_get_comments.",
        },
      },
      required: ["message"],
    },
    execute: async (args, ctx) => {
      const { message, replyToId } = (args ?? {}) as {
        message: string;
        replyToId?: string;
      };

      if (!message?.trim()) {
        return { success: false, error: "message is required and cannot be empty." };
      }

      try {
        const issue = await ctx.db.issues.getByExternalId(ctx.issueId, "figma");
        if (!issue) {
          return { success: false, error: "This tool only works for Figma-sourced issues." };
        }

        const fileKey = issue.externalId.split("#")[0];
        if (!fileKey) {
          return { success: false, error: "Could not determine Figma file key." };
        }

        const posted = await client.postComment(
          fileKey,
          `${message}\n\n---\n*Posted by Workhorse agent*`,
          replyToId,
        );

        return {
          success: true,
          output: replyToId
            ? `Reply posted to thread ${replyToId} (comment ID: ${posted.id})`
            : `Comment posted on Figma file ${fileKey} (comment ID: ${posted.id})`,
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
