/** GitHubClient - Wrapper around `gh` CLI for GitHub API access. Requires `gh auth login` first. */
import { api, gh } from "./gh-cli";
import { addLabel, removeLabel } from "./label-operations.ts";
import type {
  CreatePROptions,
  GitHubCheckRun,
  GitHubComment,
  GitHubIssue,
  GitHubPR,
  GitHubReview,
} from "./types.ts";

export class GitHubClient {
  /** Verify gh CLI is authenticated */
  async connect(): Promise<void> {
    try {
      await gh(["auth", "status"]);
    } catch (error) {
      throw new Error(
        `GitHub CLI not authenticated. Run 'gh auth login' first. Original error: ${error}`,
      );
    }
  }

  /** Disconnect (no-op for gh CLI) */
  async disconnect(): Promise<void> {}

  /** Fetch a GitHub issue */
  async fetchIssue(
    owner: string,
    repo: string,
    number: number,
  ): Promise<GitHubIssue> {
    return {
      ...(await api<Omit<GitHubIssue, "owner" | "repo">>(
        `/repos/${owner}/${repo}/issues/${number}`,
      )),
      owner,
      repo,
    };
  }

  /** Fetch a GitHub PR */
  async fetchPR(
    owner: string,
    repo: string,
    number: number,
  ): Promise<GitHubPR> {
    return {
      ...(await api<Omit<GitHubPR, "owner" | "repo">>(
        `/repos/${owner}/${repo}/pulls/${number}`,
      )),
      owner,
      repo,
    };
  }

  /** Create a PR using gh CLI */
  async createPR(
    opts: CreatePROptions,
  ): Promise<{ url: string; number: number }> {
    const args = [
      "pr",
      "create",
      "--repo",
      `${opts.owner}/${opts.repo}`,
      "--head",
      opts.head,
      "--base",
      opts.base,
      "--title",
      opts.title,
    ];

    if (opts.body) {
      args.push("--body", opts.body);
    }

    if (opts.draft) {
      args.push("--draft");
    }

    const output = await gh(args);

    // gh pr create outputs the PR URL
    const url = output.trim();
    const match = url.match(/\/pull\/(\d+)$/);

    if (!match?.[1]) {
      throw new Error(`Could not parse PR URL from gh output: ${output}`);
    }

    return { url, number: Number.parseInt(match[1], 10) };
  }

  /** Add a comment to an issue or PR */
  async addComment(
    owner: string,
    repo: string,
    number: number,
    body: string,
  ): Promise<void> {
    await api(`/repos/${owner}/${repo}/issues/${number}/comments`, {
      method: "POST",
      body: { body },
    });
  }

  /** Get reviews on a PR */
  async getPRReviews(
    owner: string,
    repo: string,
    number: number,
  ): Promise<GitHubReview[]> {
    return api<GitHubReview[]>(
      `/repos/${owner}/${repo}/pulls/${number}/reviews`,
    );
  }

  /** Get comments on a PR (both issue comments and review comments) */
  async getPRComments(
    owner: string,
    repo: string,
    number: number,
  ): Promise<GitHubComment[]> {
    // Fetch both issue comments and review comments
    const [issueComments, reviewComments] = await Promise.all([
      api<GitHubComment[]>(`/repos/${owner}/${repo}/issues/${number}/comments`),
      api<GitHubComment[]>(`/repos/${owner}/${repo}/pulls/${number}/comments`),
    ]);

    return [...issueComments, ...reviewComments];
  }

  /** Get only conversation comments on a PR (not code review comments) */
  async getIssueComments(
    owner: string,
    repo: string,
    number: number,
  ): Promise<GitHubComment[]> {
    return api<GitHubComment[]>(
      `/repos/${owner}/${repo}/issues/${number}/comments`,
    );
  }

  /** Get comments for a specific review */
  async getReviewComments(
    owner: string,
    repo: string,
    prNumber: number,
    reviewId: number,
  ): Promise<GitHubComment[]> {
    return api<GitHubComment[]>(
      `/repos/${owner}/${repo}/pulls/${prNumber}/reviews/${reviewId}/comments`,
    );
  }

  /** Get check runs for a commit ref */
  async getCheckRuns(
    owner: string,
    repo: string,
    ref: string,
  ): Promise<GitHubCheckRun[]> {
    return await api<{ check_runs: GitHubCheckRun[] }>(
      `/repos/${owner}/${repo}/commits/${ref}/check-runs`,
    ).then((r) => r.check_runs);
  }

  /** Add a label to an issue/PR */
  addLabel = addLabel;

  /** Remove a label from an issue/PR */
  removeLabel = removeLabel;
}
