/**
 * GitHub Open PR tool.
 *
 * @module workhorse-plugin-github/tools/open-pr
 */

import { type Database, type OrchestratorTool, withWorkhorseFooter } from "workhorse-core";
import type { GitHubClient } from "../client";
import type { PROpeningContext } from "../hooks";
import { getCurrentBranch, getOwnerRepoFromRemote, pushBranch } from "./git-helpers";
import type { HooksEmitter, MonitorServiceLike } from "./types";

/** Create the github_open_pr tool */
export function createOpenPRTool(
  client: GitHubClient,
  db: Database,
  hooks: HooksEmitter,
  monitors: MonitorServiceLike,
): OrchestratorTool {
  return {
    name: "github_open_pr",
    description:
      "Create a pull request from the current branch. Uses the current worktree's branch " +
      "as the head and targets the specified base branch. Updates the issue with PR information.",
    schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "PR title" },
        body: { type: "string", description: "PR description (markdown)" },
        base: {
          type: "string",
          description: "Target branch to merge into (e.g., 'main', 'develop')",
        },
        draft: { type: "boolean", description: "Create as draft PR (default: false)" },
      },
      required: ["title", "base"],
    },
    execute: async (args, ctx) => {
      const { title, body, base, draft } = args as {
        title: string;
        body?: string;
        base: string;
        draft?: boolean;
      };

      try {
        // Note: ctx.issueId is the externalId, not the internal UUID
        const issue = await db.issues.getByExternalId(ctx.issueId);
        if (!issue) {
          return { success: false, error: "Issue not found" };
        }

        const metadata = (issue.metadata ?? {}) as Record<string, unknown>;
        let owner = metadata.owner as string | undefined;
        let repo = metadata.repo as string | undefined;

        // If owner/repo not in metadata, derive from git remote
        if (!owner || !repo) {
          const remoteResult = await getOwnerRepoFromRemote(ctx.worktreePath);
          if (!remoteResult.ok) {
            return { success: false, error: remoteResult.error };
          }
          owner = remoteResult.value.owner;
          repo = remoteResult.value.repo;
        }

        // Get current branch name from worktree
        const branchResult = await getCurrentBranch(ctx.worktreePath);
        if (!branchResult.ok) {
          return { success: false, error: branchResult.error };
        }
        const head = branchResult.value;

        // Push branch to remote first
        const pushResult = await pushBranch(ctx.worktreePath, head);
        if (!pushResult.ok) {
          return { success: false, error: pushResult.error };
        }

        // Emit pr.opening hook to collect contributions from other plugins
        const openingContext: PROpeningContext = {
          issueId: ctx.issueId,
          title,
          body: body ?? "",
          base,
          head,
          draft: draft ?? false,
          worktreePath: ctx.worktreePath,
          contributions: [],
        };
        hooks.emit("github:pr.opening", openingContext);

        // Allow async handlers to complete (they push to contributions array)
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Create PR with body built from user body + plugin contributions
        const result = await client.createPR({
          owner,
          repo,
          head,
          base,
          title,
          body: withWorkhorseFooter(
            [
              body,
              ...[...openingContext.contributions]
                .sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50))
                .map((c) => `## ${c.section}\n\n${c.content}`),
            ]
              .filter(Boolean)
              .join("\n\n"),
          ),
          draft,
        });

        // Update issue in DB - PR created means we're now awaiting review
        // Use issue.id (internal UUID) for database operations
        await db.issues.update(issue.id, {
          status: "in_review",
          metadata: { ...metadata, prNumber: result.number, prUrl: result.url },
        });

        // Emit status changed hook (re-fetch to get updated fields)
        hooks.emit("issue.status_changed", {
          issue: { ...issue, status: "in_review" as const },
          from: issue.status,
          to: "in_review",
        });

        // Emit PR created hook for cross-plugin coordination
        hooks.emit("github:pr.created", {
          issueId: ctx.issueId,
          pr: { number: result.number, url: result.url, title },
        });

        // Start PR monitor for this issue
        monitors.startMonitor("github-pr", ctx.issueId);

        return { success: true, output: `Created PR #${result.number}: ${result.url}` };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
