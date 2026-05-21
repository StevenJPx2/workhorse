/**
 * GitHub Get Attachments tool.
 *
 * Downloads and returns local paths to images from GitHub issue/PR body and comments.
 * Can also download a specific image URL directly (useful for user-attachments URLs).
 *
 * @module workhorse-plugin-github/tools/get-attachments
 */

import type { AttachmentService, OrchestratorTool } from "workhorse-core";

import {
  downloadAttachments,
  downloadDirectUrl,
} from "../attachment-download.ts";
import {
  extractAllAttachments,
  filterImageAttachments,
} from "../attachments.ts";
import type { GitHubClient } from "../client.ts";

/** Create the github_get_attachments tool */
export function createGetAttachmentsTool(
  client: GitHubClient,
  attachmentService: AttachmentService,
): OrchestratorTool {
  return {
    name: "github_get_attachments",
    description:
      "Download image attachments from GitHub. Two modes:\n" +
      "1. From issue/PR: Provide owner, repo, number to extract and download all images.\n" +
      "2. Direct URL: Provide just 'url' to download a specific image (useful for " +
      "github.com/user-attachments/assets URLs that require authentication).\n" +
      "Returns local file paths where images have been saved.",
    schema: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (e.g., 'octocat')",
        },
        repo: {
          type: "string",
          description: "Repository name (e.g., 'hello-world')",
        },
        number: { type: "number", description: "Issue or PR number" },
        url: {
          type: "string",
          description:
            "Direct image URL to download (e.g., https://github.com/user-attachments/assets/...). " +
            "If provided, owner/repo/number are ignored.",
        },
        imagesOnly: {
          type: "boolean",
          description: "If true, only return image attachments (default: true)",
        },
      },
    },
    execute: async (args, ctx) => {
      const {
        owner,
        repo,
        number,
        url,
        imagesOnly = true,
      } = args as {
        owner?: string;
        repo?: string;
        number?: number;
        url?: string;
        imagesOnly?: boolean;
      };

      try {
        // Mode 1: Direct URL download
        if (url) {
          return await downloadDirectUrl(attachmentService, ctx.issueId, url);
        }

        // Mode 2: Extract from issue/PR - require owner, repo, number
        if (!owner || !repo || number === undefined) {
          return {
            success: false,
            error:
              "Either provide 'url' for direct download, or 'owner', 'repo', and 'number' " +
              "to extract images from an issue/PR.",
          };
        }

        // Fetch issue/PR and all comments (including PR review comments)
        const [issue, comments] = await Promise.all([
          client.fetchIssue(owner, repo, number),
          client.getPRComments(owner, repo, number),
        ]);

        // Extract all image references
        let attachments = extractAllAttachments(issue.body, comments);

        // Filter to images only if requested
        if (imagesOnly) {
          attachments = filterImageAttachments(attachments);
        }

        if (attachments.length === 0) {
          return {
            success: true,
            output: JSON.stringify({
              message: "No image attachments found",
              total: 0,
              attachments: [],
            }),
          };
        }

        // Get repository identifier for storage
        const repoIdentifier = `${owner}/${repo}`;

        // Download attachments
        const result = await downloadAttachments(
          attachmentService,
          repoIdentifier,
          ctx.issueId,
          attachments,
        );

        // Build response
        const response: Record<string, unknown> = {
          total: result.downloaded.length + result.cached.length,
          downloaded: result.downloaded.length,
          cached: result.cached.length,
          attachments: result.downloaded.map((att) => ({
            filename: att.filename,
            mimeType: att.mimeType,
            size: att.size,
            localPath: att.localPath,
            originalUrl: att.originalUrl,
          })),
        };

        if (result.cached.length > 0) {
          response.cachedPaths = result.cached;
        }

        if (result.failed.length > 0) {
          response.failed = result.failed;
        }

        if (result.downloaded.length > 0) {
          response.directory = attachmentService.getIssueDir(
            repoIdentifier,
            ctx.issueId,
          );
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
