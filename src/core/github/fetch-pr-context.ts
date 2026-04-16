/**
 * Fetch GitHub PR context for agent resume
 *
 * Gets the current state of a PR including reviews, comments, checks, and status.
 */

import { $ } from "bun";
import type { PRContext, PRReview, PRComment, PRCheck } from "./types.ts";

/**
 * Fetch complete PR context from GitHub using gh CLI
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - PR number
 * @returns PR context or null if fetch failed
 */
export async function fetchPRContext(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PRContext | null> {
  try {
    // Fetch PR details, reviews, comments, and checks in parallel
    const [prDetails, reviews, comments, checks] = await Promise.all([
      fetchPRDetails(owner, repo, prNumber),
      fetchPRReviews(owner, repo, prNumber),
      fetchPRComments(owner, repo, prNumber),
      fetchPRChecks(owner, repo, prNumber),
    ]);

    if (!prDetails) {
      return null;
    }

    return {
      ...prDetails,
      reviews,
      comments,
      checks,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[github] Failed to fetch PR context: ${error}`);
    return null;
  }
}

/**
 * Fetch PR details
 */
async function fetchPRDetails(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<Omit<PRContext, "reviews" | "comments" | "checks" | "fetchedAt"> | null> {
  try {
    const result = await $`gh api repos/${owner}/${repo}/pulls/${prNumber} --jq '{
      number: .number,
      title: .title,
      state: .state,
      merged: .merged,
      mergeable: .mergeable,
      commits: .commits,
      changedFiles: .changed_files,
      additions: .additions,
      deletions: .deletions,
      reviewDecision: .review_decision,
      headSha: .head.sha
    }'`.text();

    const data = JSON.parse(result.trim());

    return {
      number: data.number,
      title: data.title,
      state: data.merged ? "merged" : data.state,
      mergeable: data.mergeable,
      commits: data.commits,
      changedFiles: data.changedFiles,
      additions: data.additions,
      deletions: data.deletions,
      reviewDecision: data.reviewDecision,
      headSha: data.headSha,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch PR reviews
 */
async function fetchPRReviews(owner: string, repo: string, prNumber: number): Promise<PRReview[]> {
  try {
    const result =
      await $`gh api repos/${owner}/${repo}/pulls/${prNumber}/reviews --jq '[.[] | {id: .id, user: .user.login, state: .state, body: .body, submittedAt: .submitted_at}]'`.text();
    return JSON.parse(result.trim() || "[]");
  } catch {
    return [];
  }
}

/**
 * Fetch PR review comments
 */
async function fetchPRComments(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PRComment[]> {
  try {
    const result =
      await $`gh api repos/${owner}/${repo}/pulls/${prNumber}/comments --jq '[.[] | {id: .id, user: .user.login, body: .body, path: .path, line: .line, createdAt: .created_at}]'`.text();
    return JSON.parse(result.trim() || "[]");
  } catch {
    return [];
  }
}

/**
 * Fetch PR check runs
 */
async function fetchPRChecks(owner: string, repo: string, prNumber: number): Promise<PRCheck[]> {
  try {
    // First get the head SHA, then get check runs for it
    const shaResult =
      await $`gh api repos/${owner}/${repo}/pulls/${prNumber} --jq '.head.sha'`.text();
    const sha = shaResult.trim();

    if (!sha) return [];

    const result =
      await $`gh api repos/${owner}/${repo}/commits/${sha}/check-runs --jq '[.check_runs[] | {name: .name, status: .status, conclusion: .conclusion}]'`.text();
    return JSON.parse(result.trim() || "[]");
  } catch {
    return [];
  }
}

/**
 * Parse owner and repo from a GitHub PR URL
 */
export function parsePRUrl(
  prUrl: string,
): { owner: string; repo: string; prNumber: number } | null {
  const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) return null;

  return {
    owner: match[1],
    repo: match[2],
    prNumber: parseInt(match[3], 10),
  };
}
