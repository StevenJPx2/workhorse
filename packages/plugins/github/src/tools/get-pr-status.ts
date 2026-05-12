/**
 * GitHub Get PR Status tool.
 *
 * @module workhorse-plugin-github/tools/get-pr-status
 */

import type { OrchestratorTool } from "workhorse-core";
import type { GitHubClient } from "../client";
import type { PRStatusSummary } from "../types";

/** Create the github_get_pr_status tool */
export function createGetPRStatusTool(client: GitHubClient): OrchestratorTool {
  return {
    name: "github_get_pr_status",
    description:
      "Get the current status of a pull request including review states, CI check results, " +
      "and mergeable status. Useful for checking if a PR is ready to merge.",
    schema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (e.g., 'octocat')" },
        repo: { type: "string", description: "Repository name (e.g., 'hello-world')" },
        number: { type: "number", description: "PR number" },
      },
      required: ["owner", "repo", "number"],
    },
    execute: async (args, _ctx) => {
      const { owner, repo, number } = args as {
        owner: string;
        repo: string;
        number: number;
      };

      try {
        const [pr, reviews, checkRuns] = await Promise.all([
          client.fetchPR(owner, repo, number),
          client.getPRReviews(owner, repo, number),
          client.getCheckRuns(owner, repo, "HEAD").catch(() => []), // May fail if no commit yet
        ]);

        return {
          success: true,
          output: JSON.stringify(
            {
              state: pr.merged ? "merged" : pr.state,
              draft: pr.draft,
              mergeable: pr.mergeable,
              mergeableState: pr.mergeable_state,
              reviews: {
                approved: reviews.filter((r) => r.state === "APPROVED").length,
                changesRequested: reviews.filter((r) => r.state === "CHANGES_REQUESTED").length,
                commented: reviews.filter((r) => r.state === "COMMENTED").length,
                pending: reviews.filter((r) => r.state === "PENDING").length,
              },
              checks: {
                total: checkRuns.length,
                passing: checkRuns.filter((c) => c.conclusion === "success").length,
                failing: checkRuns.filter((c) => c.conclusion === "failure").length,
                pending: checkRuns.filter((c) => c.status !== "completed").length,
              },
              additions: pr.additions,
              deletions: pr.deletions,
              changedFiles: pr.changed_files,
            } satisfies PRStatusSummary,
            null,
            2,
          ),
        };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
