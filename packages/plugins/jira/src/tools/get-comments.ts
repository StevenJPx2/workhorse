/**
 * Jira Get Comments tool.
 *
 * @module workhorse-plugin-jira/tools/get-comments
 */

import type { OrchestratorTool } from "workhorse-core";

import { extractMediaRefsFromAdf } from "../attachments.ts";
import type { AtlassianClient } from "../client.ts";

/** Tool: Get all comments from a Jira issue */
export function createGetCommentsTool(
  client: AtlassianClient,
): OrchestratorTool {
  return {
    name: "jira_get_comments",
    description:
      "Get all comments from the current Jira issue. Returns an array of comments with id, author, body, " +
      "creation timestamp, parentId for threaded replies, and mediaCount for embedded images/files. " +
      "Use the id field to reply to a specific comment. Use jira_get_attachments to download media.",
    sources: ["jira"],
    schema: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: async (_args, ctx) => {
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
                  // Include media count if comment has embedded images/files
                  ...(extractMediaRefsFromAdf(c.body).length > 0 && {
                    mediaCount: extractMediaRefsFromAdf(c.body).length,
                  }),
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
