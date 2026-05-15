/**
 * Jira Get Attachments tool.
 *
 * Downloads and returns local paths to Jira issue attachments.
 * Also detects embedded media in comments and includes any that match issue attachments.
 *
 * @module workhorse-plugin-jira/tools/get-attachments
 */

import type { AttachmentService, OrchestratorTool } from "workhorse-core";
import {
  downloadAttachments,
  extractMediaRefsFromAdf,
  filterImageAttachments,
  type AttachmentProcessResult,
} from "../attachments.ts";
import type { AtlassianClient } from "../client.ts";
import type { JiraAttachment } from "../types.ts";

/** Info about embedded media in a comment */
interface CommentMediaInfo {
  commentId: string;
  author: string;
  mediaCount: number;
  mediaIds: string[];
}

/** Tool: Get attachments from a Jira issue */
export function createGetAttachmentsTool(
  client: AtlassianClient,
  attachmentService: AttachmentService,
): OrchestratorTool {
  return {
    name: "jira_get_attachments",
    description:
      "Download and list attachments from the current Jira issue, including media embedded " +
      "in comments. Returns local file paths where attachments have been saved. " +
      "Use `imagesOnly: true` to filter to just image files. Only works for Jira-sourced issues.",
    schema: {
      type: "object",
      properties: {
        imagesOnly: {
          type: "boolean",
          description: "If true, only return image attachments (png, jpg, gif, etc.)",
        },
      },
      required: [],
    },
    execute: async (args, ctx) => {
      try {
        const { imagesOnly } = args as { imagesOnly?: boolean };

        // Check if current issue is from Jira
        const issue = await ctx.db.issues.getByExternalId(ctx.issueId, "jira");
        if (!issue) {
          return {
            success: false,
            error: "This tool only works for Jira-sourced issues",
          };
        }

        // Fetch full issue with attachments and comments
        const jiraIssue = await client.fetchIssueWithAttachments(issue.externalId);
        let attachments: JiraAttachment[] = jiraIssue.fields.attachment ?? [];

        // Extract media refs from comments
        const comments = (jiraIssue.fields.comment as { comments: unknown[] } | undefined)
          ?.comments;
        const commentMedia = extractCommentMedia(comments ?? []);

        // Filter to images if requested
        if (imagesOnly) {
          attachments = filterImageAttachments(attachments);
        }

        // Build list of attachment IDs for cross-reference
        const attachmentIds = new Set(attachments.map((a) => a.id));

        // Check which comment media IDs match attachments
        const unmatchedMediaIds: string[] = [];
        for (const cm of commentMedia) {
          for (const mediaId of cm.mediaIds) {
            if (!attachmentIds.has(mediaId)) {
              unmatchedMediaIds.push(mediaId);
            }
          }
        }

        // Download attachments to local storage
        const repoIdentifier = issue.repository ?? "unknown";
        let result: AttachmentProcessResult = { attachments: [], idToPath: new Map() };

        if (attachments.length > 0) {
          result = await downloadAttachments(
            client,
            attachmentService,
            repoIdentifier,
            issue.id,
            attachments,
          );
        }

        // Build response
        const response: Record<string, unknown> = {
          attachments: result.attachments.map((att) => ({
            filename: att.filename,
            mimeType: att.mimeType,
            size: att.size,
            localPath: att.localPath,
          })),
          total: result.attachments.length,
        };

        if (result.attachments.length > 0) {
          response.directory = attachmentService.getIssueDir(repoIdentifier, issue.id);
        }

        // Include comment media info if there's embedded media
        if (commentMedia.length > 0) {
          response.commentMedia = commentMedia;
          response.commentMediaNote =
            "Comments contain embedded media. Media IDs that match issue attachments " +
            "have been downloaded. Some media may require viewing the Jira ticket directly.";
        }

        if (unmatchedMediaIds.length > 0) {
          response.unmatchedMediaIds = unmatchedMediaIds;
        }

        if (result.attachments.length === 0 && commentMedia.length === 0) {
          response.message = "No attachments found";
        }

        return {
          success: true,
          output: JSON.stringify(response, null, 2),
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

/** Extract media info from comments */
function extractCommentMedia(comments: unknown[]): CommentMediaInfo[] {
  const result: CommentMediaInfo[] = [];

  for (const c of comments) {
    const comment = c as Record<string, unknown>;
    const body = comment.body;
    const mediaRefs = extractMediaRefsFromAdf(body);

    if (mediaRefs.length > 0) {
      result.push({
        commentId: String(comment.id ?? "unknown"),
        author: (comment.author as { displayName: string })?.displayName ?? "Unknown",
        mediaCount: mediaRefs.length,
        mediaIds: mediaRefs.map((r) => r.id),
      });
    }
  }

  return result;
}
