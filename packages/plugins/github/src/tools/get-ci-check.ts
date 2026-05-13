/**
 * GitHub Get CI Check tool.
 *
 * Retrieves the status of a specific CI check by name for a PR or commit ref.
 *
 * @module workhorse-plugin-github/tools/get-ci-check
 */

import type { OrchestratorTool } from "workhorse-core";
import type { GitHubClient } from "../client";
import type { GitHubCheckRun } from "../types";

/** Detailed CI check result returned by the tool */
export interface CICheckResult {
  found: boolean;
  name: string;
  status: GitHubCheckRun["status"] | null;
  conclusion: GitHubCheckRun["conclusion"] | null;
  url: string | null;
  startedAt: string | null;
  completedAt: string | null;
  /** Duration in seconds if completed */
  durationSeconds: number | null;
  /** All available check names (for discoverability when check not found) */
  availableChecks?: string[];
}

/** Create the github_get_ci_check tool */
export function createGetCICheckTool(client: GitHubClient): OrchestratorTool {
  return {
    name: "github_get_ci_check",
    description:
      "Get the status of a specific CI check by name. " +
      "Use this to check if a particular CI job (e.g., 'build', 'test', 'lint') has passed or failed. " +
      "If the check name is not found, returns a list of available check names.",
    schema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (e.g., 'octocat')" },
        repo: { type: "string", description: "Repository name (e.g., 'hello-world')" },
        ref: {
          type: "string",
          description:
            "Git ref to check (commit SHA, branch name, or 'HEAD' for latest commit). Defaults to 'HEAD'.",
        },
        checkName: {
          type: "string",
          description:
            "Name of the CI check to look up (e.g., 'build', 'test', 'lint'). " +
            "Case-insensitive partial matching is supported.",
        },
      },
      required: ["owner", "repo", "checkName"],
    },
    execute: async (args, _ctx) => {
      const {
        owner,
        repo,
        ref = "HEAD",
        checkName,
      } = args as {
        owner: string;
        repo: string;
        ref?: string;
        checkName: string;
      };

      try {
        const checkRuns = await client.getCheckRuns(owner, repo, ref);

        // Find matching check (case-insensitive, supports partial match)
        const normalizedName = checkName.toLowerCase();
        const matchingCheck = checkRuns.find(
          (check) =>
            check.name.toLowerCase() === normalizedName ||
            check.name.toLowerCase().includes(normalizedName),
        );

        if (!matchingCheck) {
          const result: CICheckResult = {
            found: false,
            name: checkName,
            status: null,
            conclusion: null,
            url: null,
            startedAt: null,
            completedAt: null,
            durationSeconds: null,
            availableChecks: checkRuns.map((c) => c.name),
          };

          return {
            success: true,
            output: JSON.stringify(result, null, 2),
          };
        }

        // Calculate duration if completed
        let durationSeconds: number | null = null;
        if (matchingCheck.started_at && matchingCheck.completed_at) {
          const startTime = new Date(matchingCheck.started_at).getTime();
          const endTime = new Date(matchingCheck.completed_at).getTime();
          durationSeconds = Math.round((endTime - startTime) / 1000);
        }

        const result: CICheckResult = {
          found: true,
          name: matchingCheck.name,
          status: matchingCheck.status,
          conclusion: matchingCheck.conclusion,
          url: matchingCheck.html_url,
          startedAt: matchingCheck.started_at,
          completedAt: matchingCheck.completed_at,
          durationSeconds,
        };

        return {
          success: true,
          output: JSON.stringify(result, null, 2),
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
