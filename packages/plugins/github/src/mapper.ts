/**
 * Mapper for converting GitHub API responses to Workhorse's generic ParsedIssue.
 *
 * @module workhorse-plugin-github/mapper
 */

import type { IssueSource, IssueType, ParsedIssue } from "workhorse-core";

import type { GitHubIssue } from "./types.ts";

/** Map a GitHub issue to the generic ParsedIssue format */
export function mapGitHubToIssue(gh: GitHubIssue): ParsedIssue {
  // Infer issue type from GitHub labels
  const labelNames = gh.labels.map((l) => l.name.toLowerCase());
  let issueType: IssueType = "task";
  if (labelNames.some((l) => l.includes("bug") || l.includes("defect"))) {
    issueType = "bug";
  } else if (
    labelNames.some((l) => l.includes("feature") || l.includes("enhancement"))
  ) {
    issueType = "story";
  } else if (labelNames.some((l) => l.includes("epic"))) {
    issueType = "epic";
  }

  return {
    externalId: `${gh.owner}/${gh.repo}#${gh.number}`,
    source: "github" as IssueSource,
    // repository is set by Tracker.parseInput() based on current git repo context
    title: gh.title,
    description: gh.body ?? "",
    issueType,
    url: gh.html_url,
    assignee: gh.assignee?.login ?? undefined,
    labels: gh.labels.map((l) => l.name),
    metadata: {
      owner: gh.owner,
      repo: gh.repo,
      number: gh.number,
      state: gh.state,
      isPR: gh.pull_request !== undefined,
      createdAt: gh.created_at,
      updatedAt: gh.updated_at,
    },
  };
}
