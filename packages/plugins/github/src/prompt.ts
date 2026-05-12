/**
 * GitHub prompt enrichment for the PromptEngineer.
 *
 * Hooks `prompt.building` to add PR state and workflow context blocks.
 *
 * @module @stevenjpx2/jiratown-plugin-github/prompt
 */

import type { WorkhorseContext, PromptContextBlock } from "workhorse-core";
import type { GitHubClient } from "./client.ts";
import type { GitHubCheckRun, GitHubPR, GitHubReview } from "./types.ts";

/** Register prompt enrichment hooks */
export function registerPromptHooks(ctx: WorkhorseContext, client: GitHubClient): void {
  ctx.hooks.on("prompt.building", async ({ issueId, context }) => {
    const issue = await ctx.db.issues.getById(issueId);
    if (!issue || issue.source !== "github") return;

    const metadata = (issue.metadata ?? {}) as Record<string, unknown>;
    const owner = metadata.owner as string | undefined;
    const repo = metadata.repo as string | undefined;

    if (!owner || !repo) return;

    const prNumber = metadata.prNumber as number | undefined;

    try {
      // Fetch GitHub issue data and add context block
      context.contextBlocks.push(
        buildGitHubIssueBlock(await client.fetchIssue(owner, repo, metadata.number as number)),
      );

      // If there's a PR, fetch and add PR context
      if (prNumber) {
        const [pr, reviews, checkRuns] = await Promise.all([
          client.fetchPR(owner, repo, prNumber),
          client.getPRReviews(owner, repo, prNumber),
          client.getCheckRuns(owner, repo, "HEAD").catch(() => []),
        ]);

        context.contextBlocks.push(buildPRStateBlock(pr, reviews, checkRuns));
      }

      // Always add workflow instructions
      context.contextBlocks.push(buildGitHubWorkflowBlock(prNumber !== undefined));
    } catch {
      // Silently skip if GitHub API fails
    }
  });
}

/** Build GitHub issue context block */
function buildGitHubIssueBlock(issue: {
  owner: string;
  repo: string;
  number: number;
  title: string;
  state: string;
  labels: Array<{ name: string }>;
  assignee: { login: string } | null;
}): PromptContextBlock {
  return {
    id: "github-issue",
    title: "GitHub Issue",
    priority: 10,
    content: [
      `**Issue:** ${issue.owner}/${issue.repo}#${issue.number}`,
      `**Title:** ${issue.title}`,
      `**State:** ${issue.state}`,
      `**Assignee:** ${issue.assignee?.login ?? "Unassigned"}`,
      `**Labels:** ${issue.labels.map((l) => l.name).join(", ") || "None"}`,
    ].join("\n"),
  };
}

/** Build PR state context block */
function buildPRStateBlock(
  pr: GitHubPR,
  reviews: GitHubReview[],
  checkRuns: GitHubCheckRun[],
): PromptContextBlock {
  // Summarize reviews
  const approved = reviews.filter((r) => r.state === "APPROVED").length;
  const changesRequested = reviews.filter((r) => r.state === "CHANGES_REQUESTED").length;

  // Build check status summary
  let checkStatus = "no checks";
  if (checkRuns.length > 0) {
    const failing = checkRuns.filter((c) => c.conclusion === "failure").length;
    const pending = checkRuns.filter((c) => c.status !== "completed").length;
    if (failing > 0) {
      checkStatus = `failing (${failing}/${checkRuns.length})`;
    } else if (pending > 0) {
      checkStatus = `pending (${pending}/${checkRuns.length})`;
    } else {
      checkStatus = `passing (${checkRuns.filter((c) => c.conclusion === "success").length}/${checkRuns.length} checks)`;
    }
  }

  let reviewStatus = "no reviews";
  if (reviews.length > 0) {
    const parts: string[] = [];
    if (approved > 0) parts.push(`${approved} approved`);
    if (changesRequested > 0) parts.push(`${changesRequested} changes requested`);
    reviewStatus = parts.join(", ") || "commented only";
  }

  return {
    id: "github-pr-state",
    title: "PR State",
    priority: 10,
    content: [
      `**PR:** #${pr.number} - ${pr.title}`,
      `**State:** ${pr.merged ? "merged" : pr.state}${pr.draft ? " (draft)" : ""}`,
      `**Reviews:** ${reviewStatus}`,
      `**Mergeable:** ${pr.mergeable ?? "unknown"} (${pr.mergeable_state})`,
      `**CI Status:** ${checkStatus}`,
      `**+${pr.additions} -${pr.deletions}** across ${pr.changed_files} files`,
    ].join("\n"),
  };
}

/** Build GitHub workflow instructions block */
function buildGitHubWorkflowBlock(hasPR: boolean): PromptContextBlock {
  return {
    id: "github-workflow",
    title: "GitHub Workflow Instructions",
    priority: 50,
    content: [
      "You have access to GitHub tools:",
      "",
      ...[
        hasPR ? null : "- `github_open_pr(title, body, base)` — Create a PR for this branch",
        "- `github_add_comment(owner, repo, number, body)` — Add a comment",
        "- `github_get_pr_status(owner, repo, number)` — Check PR status",
      ].filter(Boolean),
      "",
      "Check notifications for review feedback and CI status updates.",
    ].join("\n"),
  };
}
