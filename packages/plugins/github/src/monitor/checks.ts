/**
 * Check run processing for PR monitor.
 *
 * @module workhorse-plugin-github/monitor-checks
 */

import type { GitHubCheckRun } from "../types.ts";

/** Notification creation interface */
interface NotificationCreator {
  create: (notification: {
    issueId: string;
    source: string;
    sourceId: string;
    title: string;
    body: string;
    priority: "high" | "normal" | "low";
    metadata: Record<string, unknown>;
  }) => void;
}

/** Metadata for check notifications */
interface CheckNotificationMeta {
  issueId: string;
  prNumber: number;
  owner: string;
  repo: string;
}

/** Result of processing check changes */
interface CheckChangesResult {
  hasChanges: boolean;
  summary: Record<string, unknown>;
}

/** Process check run status changes and create notifications */
export function processCheckChanges(
  checkRuns: GitHubCheckRun[],
  lastConclusions: Record<string, string>,
  notifications: NotificationCreator,
  meta: CheckNotificationMeta,
): CheckChangesResult {
  const summary: Record<string, unknown> = {};
  let hasChanges = false;

  // Check for newly failed checks
  const newlyFailed = checkRuns.filter(
    (c) =>
      c.conclusion === "failure" &&
      lastConclusions[c.name] !== "failure" &&
      lastConclusions[c.name] !== undefined,
  );

  if (newlyFailed.length > 0) {
    hasChanges = true;
    summary.failed = newlyFailed.map((c) => c.name);

    for (const check of newlyFailed) {
      notifications.create({
        issueId: meta.issueId,
        source: "github",
        sourceId: `github-check-${check.id}`,
        title: `CI check failed: ${check.name}`,
        body: `The "${check.name}" check has failed.`,
        priority: "high",
        metadata: {
          checkId: check.id,
          checkName: check.name,
          conclusion: check.conclusion,
          detailsUrl: check.html_url,
          prNumber: meta.prNumber,
          owner: meta.owner,
          repo: meta.repo,
        },
      });
    }
  }

  // Check if all checks now pass (were failing before)
  if (
    checkRuns.every((c) => c.conclusion === "success" || c.conclusion === "skipped") &&
    Object.values(lastConclusions).some((c) => c === "failure") &&
    checkRuns.length > 0
  ) {
    hasChanges = true;
    summary.allPassing = true;

    notifications.create({
      issueId: meta.issueId,
      source: "github",
      sourceId: `github-checks-passing-${Date.now()}`,
      title: "All CI checks passing",
      body: `All ${checkRuns.length} checks are now passing.`,
      priority: "normal",
      metadata: {
        checkCount: checkRuns.length,
        prNumber: meta.prNumber,
        owner: meta.owner,
        repo: meta.repo,
      },
    });
  }

  return { hasChanges, summary };
}
