/**
 * Test factories for database entities.
 *
 * @module db/__tests__/factories
 */

import type { Issue, IssueEvent, Notification } from "#db";

// oxlint-disable-next-line workhorse/no-single-reference-function -- test factory
export function makeIssueInput(
  overrides?: Partial<Omit<Issue, "id" | "createdAt" | "updatedAt">>,
): Omit<Issue, "id" | "createdAt" | "updatedAt"> {
  return {
    externalId: "AM-123",
    source: "jira",
    title: "Fix login bug",
    description: "Users cannot log in",
    status: "pending",
    issueType: "bug",
    url: "https://example.com/AM-123",
    assignee: "alice",
    labels: ["backend", "urgent"],
    metadata: { priority: "high" },
    worktreePath: null,
    ...overrides,
  };
}

// oxlint-disable-next-line workhorse/no-single-reference-function -- test factory
export function makeEventInput(
  overrides?: Partial<Omit<IssueEvent, "id" | "createdAt">>,
): Omit<IssueEvent, "id" | "createdAt"> {
  return {
    issueId: "", // Must be set by test
    type: "comment_added",
    message: "Bob commented on this issue",
    metadata: { author: "bob" },
    ...overrides,
  };
}

// oxlint-disable-next-line workhorse/no-single-reference-function -- test factory
export function makeNotificationInput(
  overrides?: Partial<
    Omit<Notification, "id" | "createdAt" | "readAt" | "acknowledgedAt" | "status">
  >,
): Omit<Notification, "id" | "createdAt" | "readAt" | "acknowledgedAt" | "status"> {
  return {
    issueId: "", // Must be set by test
    source: "jira_comment",
    sourceId: "comment-789",
    priority: "high",
    title: "New comment",
    body: "Please review this issue",
    metadata: { author: "bob" },
    ...overrides,
  };
}
