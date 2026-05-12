/**
 * Mapper for converting Jira API responses to Jiratown's generic ParsedIssue.
 *
 * @module @stevenjpx2/jiratown-plugin-jira/mapper
 */

import type { IssueSource, IssueType, ParsedIssue } from "workhorse-core";
import type { JiraComment, JiraIssue } from "./types.ts";

/** Map a Jira issue to the generic ParsedIssue format */
export function mapJiraToIssue(jira: JiraIssue): ParsedIssue {
  const fields = jira.fields;

  return {
    externalId: jira.key,
    source: "jira" as IssueSource,
    title: fields.summary ?? jira.key,
    description: extractDescription(fields.description),
    issueType: (fields.issuetype?.name?.toLowerCase() ?? "task") as IssueType,
    url: jira.self.replace("/rest/api/3/issue/", "/browse/").replace(/\?.*$/, ""),
    assignee: fields.assignee?.displayName ?? undefined,
    labels: fields.labels ?? [],
    metadata: {
      cloudId: extractCloudId(jira.self),
      priority: fields.priority?.name ?? undefined,
      status: fields.status?.name ?? undefined,
      comments: (fields.comment?.comments ?? []).map(mapJiraComment),
      created: fields.created,
      updated: fields.updated,
    },
  };
}

/** Map a single Jira comment */
export function mapJiraComment(comment: JiraComment): Record<string, unknown> {
  return {
    id: comment.id,
    author: comment.author.displayName,
    body: comment.body,
    created: comment.created,
    updated: comment.updated,
  };
}

/** Extract plain text from Jira description (handles Atlassian Document Format) */
function extractDescription(description: unknown): string {
  if (typeof description === "string") return description;
  if (description === null || description === undefined) return "";

  // Atlassian Document Format (ADF) - extract text from content recursively
  if (typeof description === "object" && description !== null) {
    const obj = description as Record<string, unknown>;
    if (Array.isArray(obj.content)) {
      return extractTextFromAdf(obj.content);
    }
  }

  return String(description);

  function extractTextFromAdf(nodes: unknown[]): string {
    const parts: string[] = [];

    for (const node of nodes) {
      if (typeof node !== "object" || node === null) continue;
      const n = node as Record<string, unknown>;

      if (typeof n.text === "string") {
        parts.push(n.text);
      } else if (Array.isArray(n.content)) {
        parts.push(extractTextFromAdf(n.content));
      }
    }

    return parts.join("\n");
  }
}

/** Extract cloud ID from Jira issue self URL */
function extractCloudId(selfUrl: string): string {
  // https://<cloudId>.atlassian.net/rest/api/3/issue/...
  return selfUrl.match(/https:\/\/([^.]+)\.atlassian\.net/)?.[1] ?? "";
}
