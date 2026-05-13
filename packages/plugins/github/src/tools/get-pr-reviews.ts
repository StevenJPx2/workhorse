/**
 * GitHub Get PR Reviews tool.
 *
 * Retrieves detailed PR reviews including review body, state, and inline comments.
 *
 * @module workhorse-plugin-github/tools/get-pr-reviews
 */

import type { OrchestratorTool } from "workhorse-core";
import type { GitHubClient } from "../client";
import type { GitHubComment, GitHubReview } from "../types";

/** A single inline comment from a review */
export interface ReviewComment {
  /** File path the comment is on */
  path: string;
  /** Line number in the file */
  line: number | null;
  /** The diff hunk for context */
  diffHunk: string | null;
  /** Comment body text */
  body: string;
}

/** A detailed review with its inline comments */
export interface DetailedReview {
  /** Review ID */
  id: number;
  /** Username of the reviewer */
  author: string;
  /** Review state */
  state: GitHubReview["state"];
  /** Review body (top-level comment) */
  body: string;
  /** When the review was submitted */
  submittedAt: string;
  /** Inline code comments attached to this review */
  comments: ReviewComment[];
}

/** Result returned by the tool */
export interface PRReviewsResult {
  /** Total number of reviews */
  totalReviews: number;
  /** Summary counts by state */
  summary: {
    approved: number;
    changesRequested: number;
    commented: number;
    dismissed: number;
    pending: number;
  };
  /** Detailed reviews (most recent first) */
  reviews: DetailedReview[];
}

/** Create the github_get_pr_reviews tool */
export function createGetPRReviewsTool(client: GitHubClient): OrchestratorTool {
  return {
    name: "github_get_pr_reviews",
    description:
      "Get detailed PR reviews including review comments, inline code feedback, and reviewer decisions. " +
      "Use this to understand what reviewers are requesting, see specific code feedback, and address review comments.",
    schema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (e.g., 'octocat')" },
        repo: { type: "string", description: "Repository name (e.g., 'hello-world')" },
        number: { type: "number", description: "PR number" },
        state: {
          type: "string",
          enum: ["all", "approved", "changes_requested", "commented", "dismissed", "pending"],
          description:
            "Filter reviews by state. Defaults to 'all'. Use 'changes_requested' to focus on blocking reviews.",
        },
        includeComments: {
          type: "boolean",
          description:
            "Include inline code comments for each review. Defaults to true. Set to false for a quicker summary.",
        },
      },
      required: ["owner", "repo", "number"],
    },
    execute: async (args, _ctx) => {
      const {
        owner,
        repo,
        number,
        state = "all",
        includeComments = true,
      } = args as {
        owner: string;
        repo: string;
        number: number;
        state?: "all" | "approved" | "changes_requested" | "commented" | "dismissed" | "pending";
        includeComments?: boolean;
      };

      try {
        const reviews = await client.getPRReviews(owner, repo, number);

        // Filter by state if specified
        const stateFilter = state.toUpperCase();
        const filteredReviews =
          state === "all" ? reviews : reviews.filter((r) => r.state === stateFilter);

        // Build summary counts
        const summary = {
          approved: reviews.filter((r) => r.state === "APPROVED").length,
          changesRequested: reviews.filter((r) => r.state === "CHANGES_REQUESTED").length,
          commented: reviews.filter((r) => r.state === "COMMENTED").length,
          dismissed: reviews.filter((r) => r.state === "DISMISSED").length,
          pending: reviews.filter((r) => r.state === "PENDING").length,
        };

        // Fetch comments for each review if requested
        const detailedReviews: DetailedReview[] = await Promise.all(
          filteredReviews.map(async (review) => {
            let comments: ReviewComment[] = [];

            if (includeComments) {
              try {
                const rawComments = await client.getReviewComments(owner, repo, number, review.id);
                comments = rawComments.map((c: GitHubComment) => ({
                  path: c.path ?? "unknown",
                  line: c.line ?? null,
                  diffHunk: c.diff_hunk ?? null,
                  body: c.body,
                }));
              } catch {
                // Some reviews may not have comments endpoint accessible
                comments = [];
              }
            }

            return {
              id: review.id,
              author: review.user.login,
              state: review.state,
              body: review.body,
              submittedAt: review.submitted_at,
              comments,
            };
          }),
        );

        // Sort by most recent first
        detailedReviews.sort(
          (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
        );

        const result: PRReviewsResult = {
          totalReviews: reviews.length,
          summary,
          reviews: detailedReviews,
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
