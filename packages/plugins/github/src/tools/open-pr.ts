/**
 * GitHub Open PR tool.
 *
 * @module @jiratown/plugin-github/tools/open-pr
 */

import type { Database, OrchestratorTool } from "@jiratown/core";
import type { GitHubClient } from "../client";
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
        const issue = db.issues.getById(ctx.issueId);
        if (!issue) {
          return { success: false, error: "Issue not found" };
        }

        const metadata = (issue.metadata ?? {}) as Record<string, unknown>;
        const owner = metadata.owner as string | undefined;
        const repo = metadata.repo as string | undefined;

        if (!owner || !repo) {
          return { success: false, error: "Issue does not have GitHub owner/repo metadata" };
        }

        // Get current branch name from worktree
        const branchProc = Bun.spawn(["git", "branch", "--show-current"], {
          cwd: ctx.worktreePath,
          stdout: "pipe",
          stderr: "pipe",
        });
        const [branchOut, branchErr, branchExit] = await Promise.all([
          new Response(branchProc.stdout).text(),
          new Response(branchProc.stderr).text(),
          branchProc.exited,
        ]);

        if (branchExit !== 0) {
          return {
            success: false,
            error: `Failed to get current branch: ${branchErr || branchOut}`,
          };
        }

        const head = branchOut.trim();

        // Push branch to remote first
        const pushProc = Bun.spawn(["git", "push", "-u", "origin", head], {
          cwd: ctx.worktreePath,
          stdout: "pipe",
          stderr: "pipe",
        });
        const [, pushErr, pushExit] = await Promise.all([
          new Response(pushProc.stdout).text(),
          new Response(pushProc.stderr).text(),
          pushProc.exited,
        ]);

        if (pushExit !== 0 && !pushErr.includes("Everything up-to-date")) {
          return { success: false, error: `Failed to push branch: ${pushErr}` };
        }

        // Create PR
        const result = await client.createPR({ owner, repo, head, base, title, body, draft });

        // Update issue in DB - PR created means we're now awaiting review
        // Store PR info in metadata (prNumber, prUrl) for cross-plugin access
        db.issues.update(ctx.issueId, {
          status: "in_review",
          metadata: {
            ...metadata,
            prNumber: result.number,
            prUrl: result.url,
          },
        });

        // Emit status changed hook
        const updatedIssue = db.issues.getById(ctx.issueId);
        if (updatedIssue) {
          hooks.emit("issue.status_changed", {
            issue: updatedIssue,
            from: issue.status,
            to: "in_review",
          });
        }

        // Emit PR created hook for cross-plugin coordination
        hooks.emit("github:pr.created", {
          issueId: ctx.issueId,
          pr: {
            number: result.number,
            url: result.url,
            title,
          },
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
