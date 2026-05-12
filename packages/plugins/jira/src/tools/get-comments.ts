/**
 * Jira Get Comments tool.
 *
 * @module @stevenjpx2/jiratown-plugin-jira/tools/get-comments
 */

import type { OrchestratorTool } from "workhorse-core";
import type { AtlassianClient } from "../client.ts";

/** Tool: Get all comments from a Jira issue */
export function createGetCommentsTool(client: AtlassianClient): OrchestratorTool {
  return {
    name: "jira_get_comments",
    description:
      "Get all comments from the current Jira issue. Returns an array of comments with id, author, body, " +
      "creation timestamp, and parentId for threaded replies. Use the id field to reply to a specific comment. " +
      "Only works for Jira-sourced issues.",
    schema: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: async (_args, ctx) => {
      try {
        // Check if current issue is from Jira
        const issue = await ctx.db.issues.getById(ctx.issueId);
        if (!issue || issue.source !== "jira") {
          return {
            success: false,
            error: "This tool only works for Jira-sourced issues",
          };
        }

        return {
          success: true,
          output: JSON.stringify(
            await client.fetchIssue(issue.externalId).then(
              (jiraIssue) =>
                jiraIssue.fields.comment?.comments.map((c) => ({
                  id: c.id,
                  author: c.author.displayName,
                  body: c.body,
                  created: c.created,
                  parentId: c.parentId,
                })) ?? [],
            ),
            null,
            2,
          ),
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
