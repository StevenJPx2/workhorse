/**
 * Hook emitters for GitHub PR monitor events.
 *
 * @module workhorse-plugin-github/monitor-hooks
 */
import type { MonitorContext } from "workhorse-core";

import type { GitHubCheckRun, GitHubPR, GitHubReview } from "../types.ts";

/** Issue metadata for hook emission */
export interface IssueInfo {
  id: string;
  externalId: string;
  source: string;
}

/** Emit review submitted hooks for new reviews */
export function emitReviewHooks(
  ctx: Pick<MonitorContext, "hooks">,
  issue: IssueInfo,
  reviews: GitHubReview[],
): void {
  for (const review of reviews) {
    ctx.hooks.emit("github:review.submitted", {
      issueId: issue.id,
      review: {
        state: review.state as
          "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED",
        author: review.user?.login ?? "unknown",
        body: review.body ?? "",
      },
    });
  }
}

/** Emit check status hooks */
export function emitCheckHooks(
  ctx: Pick<MonitorContext, "hooks">,
  issue: IssueInfo,
  prNumber: number,
  checkRuns: GitHubCheckRun[],
  summary: Record<string, unknown>,
): void {
  if (summary.failed) {
    ctx.hooks.emit("github:checks.failed", {
      issueId: issue.id,
      pr: { number: prNumber },
      failedChecks: checkRuns
        .filter((c) => c.conclusion === "failure")
        .map((c) => ({ name: c.name, url: c.html_url ?? "" })),
    });
  }
  if (summary.allPassing) {
    ctx.hooks.emit("github:checks.passed", {
      issueId: issue.id,
      pr: { number: prNumber },
    });
  }
}

/** Emit PR merged hook */
export function emitMergeHook(
  ctx: Pick<MonitorContext, "hooks">,
  issue: IssueInfo,
  prNumber: number,
  pr: GitHubPR,
): void {
  ctx.hooks.emit("github:pr.merged", {
    issueId: issue.id,
    externalId: issue.externalId,
    source: issue.source,
    pr: {
      number: prNumber,
      url: pr.html_url,
      mergedBy: pr.merged_by?.login,
      mergedAt: pr.merged_at ?? new Date().toISOString(),
    },
  });
}

/** Emit PR closed hook */
export function emitCloseHook(
  ctx: Pick<MonitorContext, "hooks">,
  issue: IssueInfo,
  prNumber: number,
  prUrl: string,
): void {
  ctx.hooks.emit("github:pr.closed", {
    issueId: issue.id,
    pr: { number: prNumber, url: prUrl },
  });
}
