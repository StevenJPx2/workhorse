/**
 * GitHub Add Comment tool.
 *
 * Supports adding comments with optional image attachments.
 * For images, the tool can embed paths to local attachments which agents
 * can reference, or include markdown image syntax for external URLs.
 *
 * @module workhorse-plugin-github/tools/add-comment
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { AttachmentService, OrchestratorTool } from "workhorse-core";
import { withWorkhorseFooter } from "workhorse-core";

import type { GitHubClient } from "../client";

/** Create the github_add_comment tool */
export function createAddCommentTool(
  client: GitHubClient,
  attachmentService?: AttachmentService,
): OrchestratorTool {
  return {
    name: "github_add_comment",
    description:
      "Add a comment to a GitHub issue or pull request. Use this to provide updates, " +
      "ask questions, or share findings with stakeholders. " +
      "Can include image attachments by providing local paths or URLs. " +
      "Do NOT include any footer or signature - one is added automatically.",
    status: ["implementing", "in_review"],
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
        body: { type: "string", description: "Comment body in markdown" },
        attachments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Local file path to attachment",
              },
              alt: { type: "string", description: "Alt text for the image" },
            },
            required: ["path"],
          },
          description:
            "Local attachment paths to include. Note: GitHub requires images to be " +
            "uploaded separately. This will add a note about the attachments.",
        },
      },
      required: ["owner", "repo", "number", "body"],
    },
    execute: async (args, _ctx) => {
      const { owner, repo, number, body, attachments } = args as {
        owner: string;
        repo: string;
        number: number;
        body: string;
        attachments?: Array<{ path: string; alt?: string }>;
      };

      try {
        let finalBody = body;

        // Handle attachments
        if (attachments && attachments.length > 0 && attachmentService) {
          const attachmentNotes: string[] = [];

          for (const att of attachments) {
            const filename = basename(att.path);
            // Read file to get size info
            try {
              const stats = readFileSync(att.path);
              const sizeKB = Math.round(stats.length / 1024);
              attachmentNotes.push(
                `- **${filename}** (${sizeKB}KB) - ${att.alt || "attachment"}`,
              );
            } catch {
              attachmentNotes.push(
                `- **${filename}** - ${att.alt || "attachment"} (file not found)`,
              );
            }
          }

          if (attachmentNotes.length > 0) {
            finalBody += "\n\n---\n📎 **Attachments** (available locally):\n";
            finalBody += attachmentNotes.join("\n");
            finalBody +=
              "\n\n*Note: These files are stored locally and can be viewed by the agent.*";
          }
        }

        await client.addComment(
          owner,
          repo,
          number,
          withWorkhorseFooter(finalBody),
        );
        return {
          success: true,
          output: `Comment added to ${owner}/${repo}#${number}`,
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
