import {
  IssueStatusSchema,
  NotificationPrioritySchema,
  NotificationStatusSchema,
} from "../index.ts";
import type {
  Issue,
  IssueStatus,
  IssueEvent,
  Notification,
  NotificationPriority,
  NotificationStatus,
} from "../index.ts";

// oxlint-disable-next-line jiratown/no-single-reference-function -- test factory
function makeIssue(overrides?: Partial<Issue>): Issue {
  return {
    id: "abc-123",
    externalId: "AM-456",
    source: "jira",
    title: "Fix login bug",
    description: "Users cannot log in",
    status: "pending",
    issueType: "bug",
    url: "https://example.com/AM-456",
    assignee: "alice",
    labels: ["backend", "urgent"],
    metadata: { jiraPriority: "high" },
    worktreePath: null,
    prUrl: null,
    prNumber: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-02"),
    ...overrides,
  };
}

// oxlint-disable-next-line jiratown/no-single-reference-function -- test factory
function makeNotification(overrides?: Partial<Notification>): Notification {
  return {
    id: "notif-1",
    issueId: "abc-123",
    source: "jira_comment",
    sourceId: "comment-789",
    priority: "high",
    status: "unread",
    title: "New comment",
    body: "Please review",
    metadata: { author: "bob" },
    createdAt: new Date("2025-01-01"),
    readAt: null,
    acknowledgedAt: null,
    ...overrides,
  };
}

// oxlint-disable-next-line jiratown/no-single-reference-function -- test factory
function makeEvent(overrides?: Partial<IssueEvent>): IssueEvent {
  return {
    id: "evt-1",
    issueId: "abc-123",
    type: "comment_added",
    message: "Bob commented",
    metadata: { author: "bob" },
    createdAt: new Date("2025-01-01"),
    ...overrides,
  };
}

test("IssueStatusSchema accepts valid statuses", () => {
  const valid: IssueStatus[] = [
    "pending",
    "queued",
    "planning",
    "implementing",
    "blocked",
    "pr_created",
    "in_review",
    "done",
  ];
  for (const s of valid) {
    expect(IssueStatusSchema.parse(s)).toBe(s);
  }
});

test("IssueStatusSchema rejects invalid status", () => {
  expect(() => IssueStatusSchema.parse("unknown")).toThrow();
});

test("NotificationPrioritySchema accepts valid priorities", () => {
  const valid: NotificationPriority[] = ["blocking", "high", "normal", "low"];
  for (const p of valid) {
    expect(NotificationPrioritySchema.parse(p)).toBe(p);
  }
});

test("NotificationPrioritySchema rejects invalid priority", () => {
  expect(() => NotificationPrioritySchema.parse("critical")).toThrow();
});

test("NotificationStatusSchema accepts valid statuses", () => {
  const valid: NotificationStatus[] = ["unread", "read", "acknowledged"];
  for (const s of valid) {
    expect(NotificationStatusSchema.parse(s)).toBe(s);
  }
});

test("NotificationStatusSchema rejects invalid status", () => {
  expect(() => NotificationStatusSchema.parse("dismissed")).toThrow();
});

test("Issue type compiles with all fields", () => {
  const issue = makeIssue();
  expect(issue.id).toBe("abc-123");
  expect(issue.source).toBe("jira");
  expect(issue.status).toBe("pending");
});

test("Issue type accepts null for optional fields", () => {
  const issue: Issue = {
    id: "x",
    externalId: "Y-1",
    source: "github",
    title: "Test",
    description: "Desc",
    status: "pending",
    issueType: "pr",
    url: null,
    assignee: null,
    labels: null,
    metadata: {},
    worktreePath: null,
    prUrl: null,
    prNumber: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  expect(issue.url).toBeNull();
  expect(issue.labels).toBeNull();
});

test("IssueEvent type compiles with all fields", () => {
  const event = makeEvent();
  expect(event.type).toBe("comment_added");
  expect(event.metadata).toBeDefined();
});

test("Notification type compiles with all fields", () => {
  const notif = makeNotification();
  expect(notif.priority).toBe("high");
  expect(notif.status).toBe("unread");
  expect(notif.readAt).toBeNull();
});

test("Notification type accepts null for optional fields", () => {
  const notif: Notification = {
    id: "n",
    issueId: "i",
    source: "github_review",
    sourceId: null,
    priority: "normal",
    status: "unread",
    title: "Review requested",
    body: "Please review",
    metadata: null,
    createdAt: new Date(),
    readAt: null,
    acknowledgedAt: null,
  };
  expect(notif.sourceId).toBeNull();
  expect(notif.metadata).toBeNull();
  expect(notif.readAt).toBeNull();
});

test.skip("TODO: implement IssuePrioritySchema for issue prioritization", () => {
  // This test documents planned behavior that is not yet implemented.
  // Issues should have a priority field with validated values.
  // Expected values: "critical", "high", "medium", "low"
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const schemas = require("../index.ts") as Record<string, unknown>;
  const IssuePrioritySchema = schemas["IssuePrioritySchema"] as { parse: (v: string) => string };
  expect(IssuePrioritySchema.parse("high")).toBe("high");
});
