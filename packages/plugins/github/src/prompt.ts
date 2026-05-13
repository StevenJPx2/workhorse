/**
 * GitHub prompt enrichment for the PromptEngineer.
 *
 * Hooks `prompt.building` to add PR state and workflow context blocks.
 *
 * @module workhorse-plugin-github/prompt
 */

import type { WorkhorseContext, PromptContextBlock } from "workhorse-core";
import type { GitHubClient } from "./client.ts";
import type { GitHubCheckRun, GitHubPR, GitHubReview } from "./types.ts";

/** Register prompt enrichment hooks */
export function registerPromptHooks(ctx: WorkhorseContext, client: GitHubClient): void {
  // Hook receives PromptBuildingContext directly (issueId is internal UUID)
  ctx.hooks.on("prompt.building", async (buildingCtx) => {
    const issue = await ctx.db.issues.getById(buildingCtx.issueId);
    if (!issue) return;

    const metadata = (issue.metadata ?? {}) as Record<string, unknown>;
    const owner = metadata.owner as string | undefined;
    const repo = metadata.repo as string | undefined;
    const prNumber = metadata.prNumber as number | undefined;
    const isGitHubIssue = issue.source === "github";

    // For non-GitHub issues, only proceed if there's PR metadata (from github_open_pr)
    if (!isGitHubIssue && !prNumber) return;

    // Need owner/repo to fetch anything from GitHub
    if (!owner || !repo) return;

    // Always add repo context when we have owner/repo
    buildingCtx.contextBlocks.push(buildRepoContextBlock(owner, repo));

    try {
      // For GitHub-sourced issues, fetch and add issue context
      if (isGitHubIssue && typeof metadata.number === "number") {
        buildingCtx.contextBlocks.push(
          buildGitHubIssueBlock(await client.fetchIssue(owner, repo, metadata.number)),
        );
      }

      // If there's a PR (GitHub or Jira issue with open PR), fetch and add PR context
      if (prNumber) {
        const pr = await client.fetchPR(owner, repo, prNumber);
        const headSha = pr.head?.sha;

        const [reviews, checkRuns] = await Promise.all([
          client.getPRReviews(owner, repo, prNumber),
          headSha ? client.getCheckRuns(owner, repo, headSha).catch(() => []) : Promise.resolve([]),
        ]);

        buildingCtx.contextBlocks.push(buildPRStateBlock(pr, reviews, checkRuns));
      }

      // Add workflow instructions
      buildingCtx.contextBlocks.push(buildGitHubWorkflowBlock(prNumber !== undefined));
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

/** Build repository context block */
function buildRepoContextBlock(owner: string, repo: string): PromptContextBlock {
  return {
    id: "github-repo",
    title: "GitHub Repository",
    priority: 5,
    content: `**Repository:** ${owner}/${repo}\n**URL:** https://github.com/${owner}/${repo}`,
  };
}

/** Build GitHub workflow instructions block */
function buildGitHubWorkflowBlock(hasPR: boolean): PromptContextBlock {
  return {
    id: "github-workflow",
    title: "GitHub Workflow",
    priority: 50,
    content: hasPR
      ? [
          "A PR already exists for this issue. Use the `github_*` tools to:",
          "- Check CI status and fix any failing checks",
          "- Review and respond to PR feedback",
          "- Check notifications for review comments and status updates",
        ].join("\n")
      : [
          "When your implementation is ready:",
          "1. Run tests to verify the fix",
          "2. Create a PR with `github_open_pr`",
          "3. Monitor CI checks and address any failures",
        ].join("\n"),
  };
}
