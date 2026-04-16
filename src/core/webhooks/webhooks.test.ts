/**
 * Webhook system tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { verifyGitHubSignature, verifyJiraSignature } from "./crypto.ts";
import {
  createGitHubHandler,
  registerPrTicketMapping,
  unregisterPrTicketMapping,
} from "./github-handler.ts";
import {
  createJiraHandler,
  registerTrackedTicket,
  unregisterTrackedTicket,
} from "./jira-handler.ts";
import { initNotificationsTable } from "../notifications/notification-store.ts";
import type { WebhookEvent } from "./types.ts";

describe("Webhook Crypto", () => {
  describe("verifyGitHubSignature", () => {
    it("should verify a valid signature", async () => {
      const payload = '{"test": "data"}';
      const secret = "test-secret";
      // Pre-computed signature for this payload and secret
      const signature = "sha256=b4820cec871eff53285edfbf9e7cd0081e8e5cca759fa3b0453d9023489421a3";

      const result = await verifyGitHubSignature(payload, signature, secret);
      expect(result).toBe(true);
    });

    it("should reject an invalid signature", async () => {
      const payload = '{"test": "data"}';
      const secret = "test-secret";
      const signature = "sha256=invalid";

      const result = await verifyGitHubSignature(payload, signature, secret);
      expect(result).toBe(false);
    });

    it("should reject signature without sha256 prefix", async () => {
      const payload = '{"test": "data"}';
      const secret = "test-secret";
      const signature = "invalid";

      const result = await verifyGitHubSignature(payload, signature, secret);
      expect(result).toBe(false);
    });
  });

  describe("verifyJiraSignature", () => {
    it("should verify matching secrets", () => {
      expect(verifyJiraSignature("secret123", "secret123")).toBe(true);
    });

    it("should reject non-matching secrets", () => {
      expect(verifyJiraSignature("secret123", "wrong")).toBe(false);
    });

    it("should reject undefined secret", () => {
      expect(verifyJiraSignature(undefined, "secret123")).toBe(false);
    });
  });
});

describe("GitHub Handler", () => {
  let db: Database;
  let handler: ReturnType<typeof createGitHubHandler>;
  let receivedEvents: WebhookEvent[];

  beforeEach(() => {
    db = new Database(":memory:");
    initNotificationsTable(db);
    receivedEvents = [];

    handler = createGitHubHandler({
      db,
      onEvent: (event) => receivedEvents.push(event),
    });

    // Register a test PR
    registerPrTicketMapping("owner/repo", 123, "TEST-456");
  });

  afterEach(() => {
    unregisterPrTicketMapping("owner/repo", 123);
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

  it("should ignore untracked PRs", async () => {
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
        number: 999, // Not tracked
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
    initNotificationsTable(db);
    receivedEvents = [];

    handler = createJiraHandler({
      db,
      onEvent: (event) => receivedEvents.push(event),
    });

    registerTrackedTicket("TEST-123");
  });

  afterEach(() => {
    unregisterTrackedTicket("TEST-123");
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

  it("should ignore untracked tickets", async () => {
    const payload = {
      webhookEvent: "comment_created",
      issue: {
        key: "OTHER-999",
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
