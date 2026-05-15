/**
 * GitHub Open PR tool.
 *
 * @module workhorse-plugin-github/tools/open-pr
 */

import { type Database, type OrchestratorTool, withWorkhorseFooter } from "workhorse-core";
import type { GitHubClient } from "../client";
import type { PROpeningContext } from "../hooks";
import { getCurrentBranch, getOwnerRepoFromRemote } from "./git-helpers";
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
      "Create a pull request from the current branch. IMPORTANT: You must push the branch " +
      "to the remote BEFORE calling this tool (use `git push -u origin <branch>`). " +
      "This tool does not push automatically to avoid timeouts from git hooks. " +
      "Updates the issue with PR information after creation.",
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

        // Note: We do NOT push here - the agent should push manually before calling this tool
        // to avoid timeouts from git hooks (pre-commit, pre-push, etc.)

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

        // Use callHook to await async handlers (e.g., Playwright screenshot collection)
        await hooks.callHook("github:pr.opening", openingContext);

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
        // Include owner/repo so GitHub monitor can poll (especially for non-GitHub issues like Jira)
        const updatedMetadata = {
          ...metadata,
          owner,
          repo,
          prNumber: result.number,
          prUrl: result.url,
        };
        await db.issues.update(issue.id, {
          status: "in_review",
          metadata: updatedMetadata,
        });

        // Emit status changed hook with updated issue (including new metadata)
        hooks.emit("issue.status_changed", {
          issue: { ...issue, status: "in_review" as const, metadata: updatedMetadata },
          from: issue.status,
          to: "in_review",
        });

        // Emit PR created hook for cross-plugin coordination
        hooks.emit("github:pr.created", {
          issueId: ctx.issueId,
          pr: { number: result.number, url: result.url, title },
        });

        // Start PR monitor for this issue (use internal ID, not externalId)
        monitors.startMonitor("github-pr", issue.id);

        return { success: true, output: `Created PR #${result.number}: ${result.url}` };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
