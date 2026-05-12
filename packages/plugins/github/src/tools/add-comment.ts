/**
 * GitHub Add Comment tool.
 *
 * @module @stevenjpx2/jiratown-plugin-github/tools/add-comment
 */

import type { OrchestratorTool } from "workhorse-core";
import type { GitHubClient } from "../client";

/** Create the github_add_comment tool */
export function createAddCommentTool(client: GitHubClient): OrchestratorTool {
  return {
    name: "github_add_comment",
    description:
      "Add a comment to a GitHub issue or pull request. Use this to provide updates, " +
      "ask questions, or share findings with stakeholders.",
    schema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (e.g., 'octocat')" },
        repo: { type: "string", description: "Repository name (e.g., 'hello-world')" },
        number: { type: "number", description: "Issue or PR number" },
        body: { type: "string", description: "Comment body in markdown" },
      },
      required: ["owner", "repo", "number", "body"],
    },
    execute: async (args, _ctx) => {
      const { owner, repo, number, body } = args as {
        owner: string;
        repo: string;
        number: number;
        body: string;
      };

      try {
        await client.addComment(owner, repo, number, body);
        return { success: true, output: `Comment added to ${owner}/${repo}#${number}` };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
