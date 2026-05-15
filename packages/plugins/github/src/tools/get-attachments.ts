/**
 * GitHub Get Attachments tool.
 *
 * Downloads and returns local paths to images from GitHub issue/PR body and comments.
 *
 * @module workhorse-plugin-github/tools/get-attachments
 */

import type { AttachmentService, OrchestratorTool } from "workhorse-core";
import { downloadAttachments } from "../attachment-download.ts";
import { extractAllAttachments, filterImageAttachments } from "../attachments.ts";
import type { GitHubClient } from "../client.ts";

/** Create the github_get_attachments tool */
export function createGetAttachmentsTool(
  client: GitHubClient,
  attachmentService: AttachmentService,
): OrchestratorTool {
  return {
    name: "github_get_attachments",
    description:
      "Download and list image attachments from a GitHub issue or PR. " +
      "Extracts images from the issue/PR body and all comments, downloads them locally. " +
      "Returns local file paths where images have been saved for further processing.",
    schema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (e.g., 'octocat')" },
        repo: { type: "string", description: "Repository name (e.g., 'hello-world')" },
        number: { type: "number", description: "Issue or PR number" },
        imagesOnly: {
          type: "boolean",
          description: "If true, only return image attachments (default: true)",
        },
      },
      required: ["owner", "repo", "number"],
    },
    execute: async (args, ctx) => {
      const {
        owner,
        repo,
        number,
        imagesOnly = true,
      } = args as {
        owner: string;
        repo: string;
        number: number;
        imagesOnly?: boolean;
      };

      try {
        // Fetch issue/PR and comments
        const [issue, comments] = await Promise.all([
          client.fetchIssue(owner, repo, number),
          client.getIssueComments(owner, repo, number),
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
          response.directory = attachmentService.getIssueDir(repoIdentifier, ctx.issueId);
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
