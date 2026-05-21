/**
 * Mapper for converting Jira API responses to Workhorse's generic ParsedIssue.
 *
 * @module workhorse-plugin-jira/mapper
 */
import type { IssueSource, IssueType, ParsedIssue } from "workhorse-core";

import { extractDescription, extractLinksFromAdf } from "./adf.ts";
import type { JiraComment, JiraIssue } from "./types.ts";

/** Extracted link from ADF content */
export interface ExtractedLink {
  /** Display text of the link */
  text: string;
  /** URL href */
  href: string;
  /** Source location: "description" or "comment" */
  source: "description" | "comment";
}

/** Map a Jira issue to the generic ParsedIssue format */
export function mapJiraToIssue(jira: JiraIssue): ParsedIssue {
  const fields = jira.fields;
  const comments = fields.comment?.comments ?? [];

  const allLinks = [
    ...extractLinksFromAdf(fields.description).map((l) => ({
      ...l,
      source: "description" as const,
    })),
    ...comments.flatMap((c) =>
      extractLinksFromAdf(c.body).map((l) => ({
        ...l,
        source: "comment" as const,
      })),
    ),
  ];

  return {
    externalId: jira.key,
    source: "jira" as IssueSource,
    title: fields.summary ?? jira.key,
    description: extractDescription(fields.description),
    issueType: (fields.issuetype?.name?.toLowerCase() ?? "task") as IssueType,
    url: `https://${new URL(jira.self).hostname}/browse/${jira.key}`,
    assignee: fields.assignee?.displayName ?? undefined,
    labels: fields.labels ?? [],
    metadata: {
      cloudId: jira.self.match(/https:\/\/([^.]+)\.atlassian\.net/)?.[1] ?? "",
      priority: fields.priority?.name ?? undefined,
      status: fields.status?.name ?? undefined,
      comments: comments.map(mapJiraComment),
      created: fields.created,
      updated: fields.updated,
      links: allLinks.length > 0 ? allLinks : undefined,
    },
  };
}

/** Map a single Jira comment — body is ADF in REST v3, extracted to plain text */
export function mapJiraComment(comment: JiraComment): Record<string, unknown> {
  return {
    id: comment.id,
    author: comment.author.displayName,
    body: extractDescription(comment.body),
    created: comment.created,
    updated: comment.updated,
  };
}
