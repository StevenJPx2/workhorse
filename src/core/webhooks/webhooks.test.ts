/**
 * Webhook system tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createGitHubHandler } from "./github-handler.ts";
import { createJiraHandler } from "./jira-handler.ts";
import { initNotificationsTable } from "../notifications/notification-store.ts";
import { migrateTickets } from "../db/migrations/tickets.ts";
import type { WebhookEvent } from "./types.ts";

/**
 * Insert a test ticket directly into the database
 */
function insertTestTicket(
  db: Database,
  opts: { id: string; jiraKey: string; prUrl?: string; prNumber?: number },
): void {
  db.prepare(`
    INSERT INTO tickets (id, jira_key, rig, pr_url, pr_number)
    VALUES (?, ?, 'test-rig', ?, ?)
  `).run(opts.id, opts.jiraKey, opts.prUrl ?? null, opts.prNumber ?? null);
}

describe("GitHub Handler", () => {
  let db: Database;
  let handler: ReturnType<typeof createGitHubHandler>;
  let receivedEvents: WebhookEvent[];

  beforeEach(() => {
    db = new Database(":memory:");
    migrateTickets(db);
    initNotificationsTable(db);
    receivedEvents = [];

    handler = createGitHubHandler({
      db,
      onEvent: (event) => receivedEvents.push(event),
    });

    // Create a test ticket with PR info
    insertTestTicket(db, {
      id: "TEST-456",
      jiraKey: "TEST-456",
      prUrl: "https://github.com/owner/repo/pull/123",
      prNumber: 123,
    });
  });

  afterEach(() => {
    db.close();
  });

  it("should handle PR review webhook", async () => {
    const payload = {
      action: "submitted",
      review: {
        id: 1001,
        user: { login: "reviewer" },
        body: "Looks good!",
        state: "approved",
        submitted_at: "2024-01-01T12:00:00Z",
      },
      pull_request: {
        number: 123,
        title: "Fix bug",
        html_url: "https://github.com/owner/repo/pull/123",
      },
      repository: {
        full_name: "owner/repo",
      },
    };

    const result = await handler(
      payload,
      { "x-github-event": "pull_request_review" },
      JSON.stringify(payload),
    );

    expect(result.success).toBe(true);
    expect(result.event?.eventType).toBe("github.pull_request_review");
    expect(result.event?.ticketId).toBe("TEST-456");
    expect(result.notificationIds?.length).toBe(1);
    expect(receivedEvents.length).toBe(1);
  });

  it("should create high-priority notification for changes_requested", async () => {
    const payload = {
      action: "submitted",
      review: {
        id: 1002,
        user: { login: "reviewer" },
        body: "Please fix this",
        state: "changes_requested",
        submitted_at: "2024-01-01T12:00:00Z",
      },
      pull_request: {
        number: 123,
        title: "Fix bug",
        html_url: "https://github.com/owner/repo/pull/123",
      },
      repository: {
        full_name: "owner/repo",
      },
    };

    const result = await handler(
      payload,
      { "x-github-event": "pull_request_review" },
      JSON.stringify(payload),
    );

    expect(result.success).toBe(true);
    expect(result.notificationIds?.length).toBe(1);

    // Verify the notification has high priority
    const notif = db
      .prepare("SELECT * FROM notifications WHERE id = ?")
      .get(result.notificationIds![0]) as {
      priority: string;
    };
    expect(notif.priority).toBe("high");
  });

  it("should ignore PRs not in database", async () => {
    const payload = {
      action: "submitted",
      review: {
        id: 1003,
        user: { login: "reviewer" },
        body: "OK",
        state: "approved",
        submitted_at: "2024-01-01T12:00:00Z",
      },
      pull_request: {
        number: 999, // Not in DB
        title: "Other PR",
        html_url: "https://github.com/owner/repo/pull/999",
      },
      repository: {
        full_name: "owner/repo",
      },
    };

    const result = await handler(
      payload,
      { "x-github-event": "pull_request_review" },
      JSON.stringify(payload),
    );

    expect(result.success).toBe(true);
    expect(result.event).toBeUndefined();
    expect(result.notificationIds).toBeUndefined();
  });

  it("should reject missing event header", async () => {
    const result = await handler({}, {}, "{}");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing");
  });
});

describe("Jira Handler", () => {
  let db: Database;
  let handler: ReturnType<typeof createJiraHandler>;
  let receivedEvents: WebhookEvent[];

  beforeEach(() => {
    db = new Database(":memory:");
    migrateTickets(db);
    initNotificationsTable(db);
    receivedEvents = [];

    handler = createJiraHandler({
      db,
      onEvent: (event) => receivedEvents.push(event),
    });

    // Create a test ticket
    insertTestTicket(db, {
      id: "TEST-123",
      jiraKey: "TEST-123",
    });
  });

  afterEach(() => {
    db.close();
  });

  it("should handle comment_created webhook", async () => {
    const payload = {
      webhookEvent: "comment_created",
      issue: {
        key: "TEST-123",
        fields: { summary: "Test issue" },
      },
      comment: {
        id: "10001",
        author: { displayName: "John Doe", accountId: "abc123" },
        body: "This is a comment",
        created: "2024-01-01T12:00:00Z",
        updated: "2024-01-01T12:00:00Z",
      },
      timestamp: 1704110400000,
    };

    const result = await handler(payload, {}, JSON.stringify(payload));

    expect(result.success).toBe(true);
    expect(result.event?.eventType).toBe("jira.comment_created");
    expect(result.event?.ticketId).toBe("TEST-123");
    expect(result.notificationIds?.length).toBe(1);
  });

  it("should ignore tickets not in database", async () => {
    const payload = {
      webhookEvent: "comment_created",
      issue: {
        key: "OTHER-999", // Not in DB
        fields: { summary: "Other issue" },
      },
      comment: {
        id: "10002",
        author: { displayName: "Jane", accountId: "def456" },
        body: "Comment",
        created: "2024-01-01T12:00:00Z",
        updated: "2024-01-01T12:00:00Z",
      },
      timestamp: 1704110400000,
    };

    const result = await handler(payload, {}, JSON.stringify(payload));

    expect(result.success).toBe(true);
    expect(result.event).toBeUndefined();
  });

  it("should not create notification for comment_updated", async () => {
    const payload = {
      webhookEvent: "comment_updated",
      issue: {
        key: "TEST-123",
        fields: { summary: "Test issue" },
      },
      comment: {
        id: "10003",
        author: { displayName: "John Doe", accountId: "abc123" },
        body: "Updated comment",
        created: "2024-01-01T12:00:00Z",
        updated: "2024-01-01T13:00:00Z",
      },
      timestamp: 1704114000000,
    };

    const result = await handler(payload, {}, JSON.stringify(payload));

    expect(result.success).toBe(true);
    expect(result.event?.eventType).toBe("jira.comment_updated");
    expect(result.notificationIds).toBeUndefined();
  });
});
