/**
 * Jira issue mapping - Transforms raw API responses to domain objects
 */

import type { JiraIssue, GetJiraIssueResponse } from "./types.ts";

/**
 * Maps a GetJiraIssueResponse to a JiraIssue with safe field access.
 * Handles missing or partial data gracefully.
 */
export function mapIssueResponse(data: GetJiraIssueResponse, cloudId: string): JiraIssue {
  const baseUrl = `https://${cloudId}`;

  // Validate required fields exist before accessing
  if (!data.fields) {
    throw new Error(`Invalid Jira response: missing 'fields' object`);
  }

  if (!data.key) {
    throw new Error(`Invalid Jira response: missing 'key' field`);
  }

  const fields = data.fields;

  return {
    key: data.key,
    summary: fields.summary ?? "",
    description: fields.description ?? null,
    status: fields.status?.name ?? "Unknown",
    priority: fields.priority?.name ?? null,
    assignee: fields.assignee?.displayName ?? null,
    reporter: fields.reporter?.displayName ?? null,
    issueType: fields.issuetype?.name ?? "Unknown",
    url: `${baseUrl}/browse/${data.key}`,
    projectKey: fields.project?.key ?? "",
    created: fields.created ?? new Date().toISOString(),
    updated: fields.updated ?? new Date().toISOString(),
  };
}
