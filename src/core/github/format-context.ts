/**
 * Format PR context as a summary for the agent
 */

import type { PRContext, PRReview } from "./types.ts";

/**
 * Format PR context as a summary for the agent
 */
export function formatPRContextSummary(ctx: PRContext): string {
  const lines: string[] = [];

  lines.push(`## PR #${ctx.number}: ${ctx.title}`);
  lines.push("");

  // Status line
  const stateEmoji = ctx.state === "merged" ? "🟣" : ctx.state === "closed" ? "🔴" : "🟢";
  lines.push(`**Status:** ${stateEmoji} ${ctx.state.toUpperCase()}`);

  // Review decision
  if (ctx.reviewDecision) {
    const decisionEmoji =
      ctx.reviewDecision === "APPROVED"
        ? "✅"
        : ctx.reviewDecision === "CHANGES_REQUESTED"
          ? "🔄"
          : "⏳";
    lines.push(`**Review Decision:** ${decisionEmoji} ${ctx.reviewDecision.replace(/_/g, " ")}`);
  }

  // Mergeable status
  if (ctx.mergeable !== null) {
    lines.push(`**Mergeable:** ${ctx.mergeable ? "Yes ✓" : "No ✗"}`);
  }

  // Stats
  lines.push(
    `**Changes:** ${ctx.commits} commits, ${ctx.changedFiles} files (+${ctx.additions}/-${ctx.deletions})`,
  );

  // Checks summary
  if (ctx.checks.length > 0) {
    const passed = ctx.checks.filter((c) => c.conclusion === "success").length;
    const failed = ctx.checks.filter((c) => c.conclusion === "failure").length;
    const pending = ctx.checks.filter((c) => c.status !== "completed").length;

    lines.push(`**Checks:** ${passed} passed, ${failed} failed, ${pending} pending`);

    // List failed checks
    const failedChecks = ctx.checks.filter((c) => c.conclusion === "failure");
    if (failedChecks.length > 0) {
      lines.push("  Failed checks:");
      for (const check of failedChecks) {
        lines.push(`  - ❌ ${check.name}`);
      }
    }
  }

  // Reviews summary
  if (ctx.reviews.length > 0) {
    lines.push("");
    lines.push("### Reviews");

    // Group by latest review per user
    const latestReviews = new Map<string, PRReview>();
    for (const review of ctx.reviews) {
      const existing = latestReviews.get(review.user);
      if (!existing || new Date(review.submittedAt) > new Date(existing.submittedAt)) {
        latestReviews.set(review.user, review);
      }
    }

    for (const [user, review] of latestReviews) {
      const emoji =
        review.state === "APPROVED" ? "✅" : review.state === "CHANGES_REQUESTED" ? "🔄" : "💬";
      lines.push(`- ${emoji} **${user}**: ${review.state.replace(/_/g, " ")}`);
      if (review.body) {
        // Truncate long review bodies
        const body = review.body.length > 200 ? review.body.slice(0, 200) + "..." : review.body;
        lines.push(`  > ${body.replace(/\n/g, "\n  > ")}`);
      }
    }
  }

  // Recent comments
  if (ctx.comments.length > 0) {
    lines.push("");
    lines.push("### Recent Review Comments");

    // Show last 5 comments
    const recentComments = ctx.comments.slice(-5);
    for (const comment of recentComments) {
      const location = comment.path
        ? ` on \`${comment.path}\`${comment.line ? `:${comment.line}` : ""}`
        : "";
      lines.push(`- **${comment.user}**${location}:`);
      const body = comment.body.length > 150 ? comment.body.slice(0, 150) + "..." : comment.body;
      lines.push(`  > ${body.replace(/\n/g, "\n  > ")}`);
    }

    if (ctx.comments.length > 5) {
      lines.push(`  _(${ctx.comments.length - 5} more comments)_`);
    }
  }

  return lines.join("\n");
}
