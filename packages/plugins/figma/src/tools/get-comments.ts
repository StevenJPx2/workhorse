/**
 * figma_get_comments tool — reads the comment threads on a Figma file.
 *
 * Surfaces designer annotations, feedback, and open questions directly
 * inside the agent's context.
 *
 * @module workhorse-plugin-figma/tools/get-comments
 */
import type { OrchestratorTool } from "workhorse-core";

import type { FigmaClient } from "../client.ts";

/** Tool: Fetch comments and feedback threads from the Figma file */
export function createGetCommentsTool(client: FigmaClient): OrchestratorTool {
  return {
    name: "figma_get_comments",
    description:
      "Fetch all comments and designer feedback from the Figma file linked to this issue. " +
      "Includes open threads, replies, and resolved comments. " +
      "Only works for Figma-sourced issues.",
    schema: {
      type: "object",
      properties: {
        includeResolved: {
          type: "boolean",
          description:
            "Include resolved comments in the results. Defaults to false " +
            "(only unresolved/open threads).",
        },
      },
      required: [],
    },
    execute: async (args, ctx) => {
      const { includeResolved = false } = (args ?? {}) as {
        includeResolved?: boolean;
      };

      try {
        const issue = await ctx.db.issues.getByExternalId(ctx.issueId, "figma");
        if (!issue) {
          return {
            success: false,
            error: "This tool only works for Figma-sourced issues.",
          };
        }

        const fileKey = issue.externalId.split("#")[0];
        if (!fileKey) {
          return {
            success: false,
            error: "Could not determine Figma file key.",
          };
        }

        const allComments = await client.fetchComments(fileKey);

        // Filter by resolution status
        const comments = includeResolved
          ? allComments
          : allComments.filter((c) => !c.resolved_at);

        if (comments.length === 0) {
          return {
            success: true,
            output: includeResolved
              ? "No comments found on this Figma file."
              : "No open comments on this Figma file.",
          };
        }

        // Group top-level comments and their replies
        const repliesMap = new Map<string, typeof comments>();
        for (const c of comments.filter((c) => c.parent_id)) {
          const bucket = repliesMap.get(c.parent_id!) ?? [];
          bucket.push(c);
          repliesMap.set(c.parent_id!, bucket);
        }

        return {
          success: true,
          output: comments
            .filter((c) => !c.parent_id)
            .map((root) => {
              const thread = [
                `[${root.id}] **${root.user.handle}** (${root.created_at})${root.resolved_at ? " ✅ resolved" : ""}`,
                root.message,
              ];
              for (const reply of repliesMap.get(root.id) ?? []) {
                thread.push(
                  `  ↳ [${reply.id}] **${reply.user.handle}** (${reply.created_at}): ${reply.message}`,
                );
              }
              return thread.join("\n");
            })
            .join("\n\n---\n\n"),
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
