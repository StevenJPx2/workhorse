/**
 * Smart reply template generator for PR review comments
 *
 * Analyzes comment content and returns an appropriate reply template.
 */

import type { GitHubReviewComment } from "#core/github/types.ts";

export function generateSmartReply(comment: GitHubReviewComment): string {
  const text = comment.body.toLowerCase();

  if (
    text.includes("security") ||
    text.includes("vulnerability") ||
    text.includes("injection") ||
    text.includes("sanitize")
  ) {
    return "Important security concern. I'll address this right away.";
  }
  if (
    text.includes("unit test") ||
    text.includes("test coverage") ||
    text.includes("spec") ||
    text.includes("testing")
  ) {
    return "Thanks for the testing feedback. I'll add the necessary tests.";
  }
  if (
    text.includes("nit") ||
    text.includes("style") ||
    text.includes("formatting") ||
    text.includes("whitespace")
  ) {
    return "Good point, I'll clean this up.";
  }
  if (
    text.includes("performance") ||
    text.includes("slow") ||
    text.includes("optimization") ||
    text.includes("n+1")
  ) {
    return "Thanks for the performance suggestion. I'll optimize this.";
  }
  if (
    text.includes("bug") ||
    text.includes("broken") ||
    text.includes("crash") ||
    text.includes("error")
  ) {
    return "Good catch! I'll fix this issue.";
  }
  if (
    text.includes("refactor") ||
    text.includes("clean") ||
    text.includes("rename") ||
    text.includes("simplify")
  ) {
    return "Great suggestion, I'll refactor this.";
  }
  if (text.includes("documentation") || text.includes("docs") || text.includes("readme")) {
    return "Good call, I'll add the documentation.";
  }
  if (text.includes("fix")) {
    return "Good catch! I'll fix this issue.";
  }

  return "Thanks for the feedback! I'll address this.";
}
