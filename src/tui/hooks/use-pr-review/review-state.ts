/**
 * Review state determination logic
 *
 * Given a list of PR reviews, determines the overall review state
 * by looking at the latest review from each reviewer.
 */

import type { GitHubPRReview, ReviewState } from "#core/github/types.ts";

export function determineReviewState(reviews: GitHubPRReview[]): ReviewState {
  if (reviews.length === 0) return "pending";

  const latestReviews = new Map<string, GitHubPRReview>();
  for (const review of reviews) {
    const existing = latestReviews.get(review.user);
    if (!existing || review.submittedAt > existing.submittedAt) {
      latestReviews.set(review.user, review);
    }
  }

  let hasChangesRequested = false;
  let hasApproval = false;

  for (const review of latestReviews.values()) {
    if (review.state === "CHANGES_REQUESTED") hasChangesRequested = true;
    if (review.state === "APPROVED") hasApproval = true;
  }

  if (hasChangesRequested) return "changes_requested";
  if (hasApproval) return "approved";
  return "commented";
}
