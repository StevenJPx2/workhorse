/**
 * Mapper for converting Jira API responses to Workhorse's generic ParsedIssue.
 *
 * @module workhorse-plugin-jira/mapper
 */

import type { IssueSource, IssueType, ParsedIssue } from "workhorse-core";
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

  // Extract links from description and comments
  const allLinks = [
    ...extractLinksFromAdf(fields.description).map((l) => ({
      ...l,
      source: "description" as const,
    })),
    ...(fields.comment?.comments ?? []).flatMap((c) =>
      extractLinksFromAdf(c.body).map((l) => ({ ...l, source: "comment" as const })),
    ),
  ];

  return {
    externalId: jira.key,
    source: "jira" as IssueSource,
    // repository is set by Tracker.parseInput() based on current git repo context
    title: fields.summary ?? jira.key,
    description: extractDescription(fields.description),
    issueType: (fields.issuetype?.name?.toLowerCase() ?? "task") as IssueType,
    url: `https://${new URL(jira.self).hostname}/browse/${jira.key}`,
    assignee: fields.assignee?.displayName ?? undefined,
    labels: fields.labels ?? [],
    metadata: {
      cloudId: extractCloudId(jira.self),
      priority: fields.priority?.name ?? undefined,
      status: fields.status?.name ?? undefined,
      comments: (fields.comment?.comments ?? []).map(mapJiraComment),
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

/**
 * Extract links from ADF content.
 * In ADF, links appear as text nodes with a "link" mark:
 * { type: "text", text: "link text", marks: [{ type: "link", attrs: { href: "..." } }] }
 */
export function extractLinksFromAdf(adf: unknown): Array<{ text: string; href: string }> {
  const links: Array<{ text: string; href: string }> = [];

  if (adf === null || adf === undefined) return links;

  // Handle plain string — extract URLs with regex
  if (typeof adf === "string") {
    const matches = adf.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/g);
    if (matches) {
      for (const href of matches) {
        links.push({ text: href, href });
      }
    }
    return links;
  }

  if (typeof adf !== "object") return links;

  const obj = adf as Record<string, unknown>;

  // Check if this is a text node with link marks
  if (typeof obj.text === "string" && Array.isArray(obj.marks)) {
    for (const mark of obj.marks) {
      if (typeof mark === "object" && mark !== null) {
        const m = mark as Record<string, unknown>;
        if (m.type === "link" && typeof (m.attrs as Record<string, unknown>)?.href === "string") {
          links.push({
            text: obj.text as string,
            href: (m.attrs as Record<string, unknown>).href as string,
          });
        }
      }
    }
  }

  // Recurse into content arrays
  if (Array.isArray(obj.content)) {
    for (const child of obj.content) {
      links.push(...extractLinksFromAdf(child));
    }
  }

  return links;
}
