/**
 * Tests for pollers
 */

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createJiraPoller } from "./jira-poller.ts";
import { createGitHubPoller } from "./github-poller.ts";
import { createAgentPoller } from "./agent-poller.ts";
import type { JiraComment, GitHubReview, GitHubComment } from "./types.ts";
import { migrateNotifications } from "../../lib/db/migrations/notifications.ts";
import { migrateTickets } from "../../lib/db/migrations/tickets.ts";

describe("Jira Poller", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    migrateTickets(db);
    migrateNotifications(db);
  });

  afterEach(() => {
    db.close();
  });

  test("creates poller in idle state", () => {
    const fetchComments = mock(() => Promise.resolve([]));

    const poller = createJiraPoller({
      db,
      ticketId: "AM-123",
      interval: 5000,
      fetchComments,
    });

    expect(poller.state).toBe("idle");
    expect(poller.lastResult()).toBeNull();
  });

  test("starts polling when start() called", () => {
    const fetchComments = mock(() => Promise.resolve([]));

    const poller = createJiraPoller({
      db,
      ticketId: "AM-123",
      interval: 5000,
      fetchComments,
    });

    poller.start();
    expect(poller.state).toBe("running");
    poller.stop();
  });

  test("stops polling when stop() called", () => {
    const fetchComments = mock(() => Promise.resolve([]));

    const poller = createJiraPoller({
      db,
      ticketId: "AM-123",
      interval: 5000,
      fetchComments,
    });

    poller.start();
    poller.stop();
    expect(poller.state).toBe("stopped");
  });

  test("polls and returns result", async () => {
    const comments: JiraComment[] = [
      {
        id: "1",
        author: "Test User",
        body: "Test comment",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
    ];

    const fetchComments = mock(() => Promise.resolve(comments));

    const poller = createJiraPoller({
      db,
      ticketId: "AM-123",
      interval: 5000,
      fetchComments,
    });

    const result = await poller.poll();

    expect(result.success).toBe(true);
    expect(result.data?.ticketId).toBe("AM-123");
    expect(result.data?.comments).toHaveLength(1);
  });

  test("detects new comments", async () => {
    const newCommentsReceived: JiraComment[] = [];
    const fetchComments = mock(() =>
      Promise.resolve([
        {
          id: "1",
          author: "User",
          body: "Comment 1",
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
      ]),
    );

    const poller = createJiraPoller({
      db,
      ticketId: "AM-123",
      interval: 5000,
      fetchComments,
      onNewComments: (comments) => newCommentsReceived.push(...comments),
    });

    // First poll - all comments are new
    await poller.poll();
    expect(newCommentsReceived).toHaveLength(1);

    // Second poll - same comments, no new ones
    newCommentsReceived.length = 0;
    await poller.poll();
    expect(newCommentsReceived).toHaveLength(0);
  });

  test("handles errors gracefully", async () => {
    const fetchComments = mock(() => Promise.reject(new Error("API Error")));
    const onError = mock(() => {});

    const poller = createJiraPoller({
      db,
      ticketId: "AM-123",
      interval: 5000,
      fetchComments,
      onError,
    });

    const result = await poller.poll();

    expect(result.success).toBe(false);
    expect(result.error).toBe("API Error");
    expect(onError).toHaveBeenCalled();
  });
});

describe("GitHub Poller", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    migrateTickets(db);
    migrateNotifications(db);
  });

  afterEach(() => {
    db.close();
  });

  test("creates poller in idle state", () => {
    const poller = createGitHubPoller({
      db,
      ticketId: "AM-123",
      prNumber: 42,
      interval: 5000,
      fetchReviews: () => Promise.resolve([]),
      fetchComments: () => Promise.resolve([]),
    });

    expect(poller.state).toBe("idle");
  });

  test("polls and returns result", async () => {
    const reviews: GitHubReview[] = [
      {
        id: 1,
        user: "reviewer",
        state: "APPROVED",
        body: "LGTM!",
        submittedAt: new Date().toISOString(),
      },
    ];

    const comments: GitHubComment[] = [
      {
        id: 1,
        user: "commenter",
        body: "Nice work",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const poller = createGitHubPoller({
      db,
      ticketId: "AM-123",
      prNumber: 42,
      interval: 5000,
      fetchReviews: () => Promise.resolve(reviews),
      fetchComments: () => Promise.resolve(comments),
    });

    const result = await poller.poll();

    expect(result.success).toBe(true);
    expect(result.data?.prNumber).toBe(42);
    expect(result.data?.reviews).toHaveLength(1);
    expect(result.data?.comments).toHaveLength(1);
  });

  test("detects new reviews and comments", async () => {
    const newReviewsReceived: GitHubReview[] = [];
    const newCommentsReceived: GitHubComment[] = [];

    const poller = createGitHubPoller({
      db,
      ticketId: "AM-123",
      prNumber: 42,
      interval: 5000,
      fetchReviews: () =>
        Promise.resolve([
          {
            id: 1,
            user: "reviewer",
            state: "APPROVED" as const,
            body: "",
            submittedAt: new Date().toISOString(),
          },
        ]),
      fetchComments: () =>
        Promise.resolve([
          {
            id: 1,
            user: "commenter",
            body: "Test",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ]),
      onNewReviews: (r) => newReviewsReceived.push(...r),
      onNewComments: (c) => newCommentsReceived.push(...c),
    });

    // First poll - all new
    await poller.poll();
    expect(newReviewsReceived).toHaveLength(1);
    expect(newCommentsReceived).toHaveLength(1);

    // Second poll - none new
    newReviewsReceived.length = 0;
    newCommentsReceived.length = 0;
    await poller.poll();
    expect(newReviewsReceived).toHaveLength(0);
    expect(newCommentsReceived).toHaveLength(0);
  });
});

describe("Agent Poller", () => {
  test("creates poller in idle state", () => {
    const poller = createAgentPoller({
      ticketId: "AM-123",
      interval: 5000,
    });

    expect(poller.state).toBe("idle");
  });

  test("starts and stops correctly", () => {
    const poller = createAgentPoller({
      ticketId: "AM-123",
      interval: 5000,
    });

    poller.start();
    expect(poller.state).toBe("running");

    poller.stop();
    expect(poller.state).toBe("stopped");
  });

  test("auto-starts when option set", () => {
    const poller = createAgentPoller({
      ticketId: "AM-123",
      interval: 5000,
      autoStart: true,
    });

    expect(poller.state).toBe("running");
    poller.stop();
  });
});
