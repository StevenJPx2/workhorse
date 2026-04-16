/**
 * GitHub API fetcher functions
 *
 * Uses the gh CLI to fetch reviews and comments from GitHub PRs.
 */

import type { GitHubReview, GitHubComment } from "./types.ts";

/**
 * Fetch PR reviews from GitHub
 */
export async function fetchGitHubReviews(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<GitHubReview[]> {
  try {
    const result =
      await Bun.$`gh api repos/${owner}/${repo}/pulls/${prNumber}/reviews --jq '[.[] | {id: .id, user: .user.login, state: .state, body: .body, submittedAt: .submitted_at}]'`.text();
    return JSON.parse(result.trim() || "[]");
  } catch {
    return [];
  }
}

/**
 * Fetch inline review comments (comments on specific lines of code)
 */
export async function fetchGitHubReviewComments(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<GitHubComment[]> {
  try {
    const result =
      await Bun.$`gh api repos/${owner}/${repo}/pulls/${prNumber}/comments --jq '[.[] | {id: .id, user: .user.login, body: .body, path: .path, line: .line, createdAt: .created_at, updatedAt: .updated_at}]'`.text();
    return JSON.parse(result.trim() || "[]");
  } catch {
    return [];
  }
}

/**
 * Fetch general PR comments (conversation tab comments)
 * PRs are treated as issues in GitHub API, so we use the issues endpoint
 */
export async function fetchGitHubIssueComments(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<GitHubComment[]> {
  try {
    const result =
      await Bun.$`gh api repos/${owner}/${repo}/issues/${prNumber}/comments --jq '[.[] | {id: .id, user: .user.login, body: .body, createdAt: .created_at, updatedAt: .updated_at}]'`.text();
    return JSON.parse(result.trim() || "[]");
  } catch {
    return [];
  }
}

/**
 * Fetch all comments (both review comments and issue comments)
 */
export async function fetchGitHubComments(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<GitHubComment[]> {
  const [reviewComments, issueComments] = await Promise.all([
    fetchGitHubReviewComments(owner, repo, prNumber),
    fetchGitHubIssueComments(owner, repo, prNumber),
  ]);

  // Merge and return all comments
  // Issue comments get negative IDs to avoid collision with review comment IDs
  const issueCommentsWithOffset = issueComments.map((c) => ({
    ...c,
    id: -c.id,
  }));

  return [...reviewComments, ...issueCommentsWithOffset];
}
