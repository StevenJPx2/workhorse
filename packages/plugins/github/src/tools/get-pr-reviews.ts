/**
 * GitHub Get PR Reviews tool.
 * Retrieves detailed PR reviews including review body, state, inline comments,
 * and general PR conversation comments.
 * @module workhorse-plugin-github/tools/get-pr-reviews
 */

import type { OrchestratorTool } from "workhorse-core";
import type { GitHubClient } from "../client";
import type {
  ConversationComment,
  DetailedReview,
  GitHubComment,
  PRReviewsResult,
  ReviewComment,
} from "../types";

// Re-export types for consumers
export type { ConversationComment, DetailedReview, PRReviewsResult, ReviewComment };

/** Create the github_get_pr_reviews tool */
export function createGetPRReviewsTool(client: GitHubClient): OrchestratorTool {
  return {
    name: "github_get_pr_reviews",
    description:
      "Get detailed PR reviews and conversation comments including review comments, inline code feedback, " +
      "reviewer decisions, and general PR discussion. Use this to understand what reviewers are requesting, " +
      "see specific code feedback, read conversation comments, and address all feedback.",
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
        const [reviews, issueComments] = await Promise.all([
          client.getPRReviews(owner, repo, number),
          client.getIssueComments(owner, repo, number),
        ]);

        const stateFilter = state.toUpperCase();

        const detailedReviews: DetailedReview[] = await Promise.all(
          (state === "all" ? reviews : reviews.filter((r) => r.state === stateFilter)).map(
            async (review) => {
              let comments: ReviewComment[] = [];
              if (includeComments) {
                try {
                  comments = await client
                    .getReviewComments(owner, repo, number, review.id)
                    .then((r) =>
                      r.map((c: GitHubComment) => ({
                        path: c.path ?? "unknown",
                        line: c.line ?? null,
                        diffHunk: c.diff_hunk ?? null,
                        body: c.body,
                      })),
                    );
                } catch {
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
            },
          ),
        );

        detailedReviews.sort(
          (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
        );

        const conversationComments: ConversationComment[] = issueComments
          .map((c) => ({ id: c.id, author: c.user.login, body: c.body, createdAt: c.created_at }))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return {
          success: true,
          output: JSON.stringify(
            {
              totalReviews: reviews.length,
              totalConversationComments: conversationComments.length,
              summary: {
                approved: reviews.filter((r) => r.state === "APPROVED").length,
                changesRequested: reviews.filter((r) => r.state === "CHANGES_REQUESTED").length,
                commented: reviews.filter((r) => r.state === "COMMENTED").length,
                dismissed: reviews.filter((r) => r.state === "DISMISSED").length,
                pending: reviews.filter((r) => r.state === "PENDING").length,
              },
              reviews: detailedReviews,
              conversationComments,
            } satisfies PRReviewsResult,
            null,
            2,
          ),
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
