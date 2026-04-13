/**
 * Tests for GitHub PR Poller
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createGitHubPoller } from "./github-poller.ts";
import type { GitHubReview, GitHubComment } from "./types.ts";

// Mock createNotification function (injected via options)
const mockCreateNotification = mock(
  (_db: unknown, _opts: unknown) =>
    ({ id: 1, ticket_id: "test", source_type: "github_pr_review" }) as any,
);

describe("createGitHubPoller", () => {
  let db: Database;
  let fetchReviews: ReturnType<typeof mock>;
  let fetchComments: ReturnType<typeof mock>;

  const baseReview: GitHubReview = {
    id: 1,
    user: "reviewer1",
    state: "APPROVED",
    body: "Looks good!",
    submittedAt: "2024-01-01T10:00:00Z",
  };

  const baseComment: GitHubComment = {
    id: 101,
    user: "commenter1",
    body: "Please fix line 42",
    createdAt: "2024-01-01T11:00:00Z",
    updatedAt: "2024-01-01T11:00:00Z",
    path: "src/app.ts",
    line: 42,
  };

  beforeEach(() => {
    db = new Database(":memory:");
    fetchReviews = mock(() => Promise.resolve([]));
    fetchComments = mock(() => Promise.resolve([]));
    mockCreateNotification.mockClear();
    mockCreateNotification.mockImplementation(() => ({ id: 1 }));
  });

  afterEach(() => {
    db.close();
  });

  // Helper to create poller with mocked notification function
  const createPoller = (overrides: Partial<Parameters<typeof createGitHubPoller>[0]> = {}) => {
    return createGitHubPoller({
      db,
      ticketId: "TICKET-1",
      prNumber: 42,
      interval: 5000,
      fetchReviews,
      fetchComments,
      createNotificationFn: mockCreateNotification,
      ...overrides,
    });
  };

  describe("initial state", () => {
    it("should start in idle state", () => {
      const poller = createGitHubPoller({
        db,
        ticketId: "TICKET-1",
        prNumber: 42,
        interval: 5000,
        fetchReviews,
        fetchComments,
      });

      expect(poller.state).toBe("idle");
    });

    it("should have null lastResult initially", () => {
      const poller = createGitHubPoller({
        db,
        ticketId: "TICKET-1",
        prNumber: 42,
        interval: 5000,
        fetchReviews,
        fetchComments,
      });

      expect(poller.lastResult()).toBeNull();
    });
  });

  describe("start", () => {
    it("should transition to running state on start", () => {
      const poller = createGitHubPoller({
        db,
        ticketId: "TICKET-1",
        prNumber: 42,
        interval: 5000,
        fetchReviews,
        fetchComments,
      });

      poller.start();
      expect(poller.state).toBe("running");
      poller.stop();
    });

    it("should not start twice if already running", () => {
      const poller = createGitHubPoller({
        db,
        ticketId: "TICKET-1",
        prNumber: 42,
        interval: 5000,
        fetchReviews,
        fetchComments,
      });

      poller.start();
      poller.start(); // Second call should be no-op
      expect(poller.state).toBe("running");
      poller.stop();
    });

    it("should auto-start when autoStart is true", async () => {
      const poller = createGitHubPoller({
        db,
        ticketId: "TICKET-1",
        prNumber: 42,
        interval: 60000,
        fetchReviews,
        fetchComments,
        autoStart: true,
      });

      expect(poller.state).toBe("running");
      poller.stop();
    });
  });

  describe("stop", () => {
    it("should transition to stopped state", () => {
      const poller = createGitHubPoller({
        db,
        ticketId: "TICKET-1",
        prNumber: 42,
        interval: 5000,
        fetchReviews,
        fetchComments,
      });

      poller.start();
      poller.stop();
      expect(poller.state).toBe("stopped");
    });

    it("should clear interval on stop", () => {
      const poller = createGitHubPoller({
        db,
        ticketId: "TICKET-1",
        prNumber: 42,
        interval: 5000,
        fetchReviews,
        fetchComments,
      });

      poller.start();
      poller.stop();
      // After stopping, starting again should work
      poller.start();
      expect(poller.state).toBe("running");
      poller.stop();
    });

    it("should be safe to call stop when already stopped", () => {
      const poller = createGitHubPoller({
        db,
        ticketId: "TICKET-1",
        prNumber: 42,
        interval: 5000,
        fetchReviews,
        fetchComments,
      });

      expect(() => poller.stop()).not.toThrow();
    });
  });

  describe("poll", () => {
    it("should return successful result when no reviews or comments", async () => {
      const poller = createGitHubPoller({
        db,
        ticketId: "TICKET-1",
        prNumber: 42,
        interval: 5000,
        fetchReviews,
        fetchComments,
      });

      const result = await poller.poll();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.newReviews).toHaveLength(0);
      expect(result.data?.newComments).toHaveLength(0);
      expect(result.timestamp).toBeDefined();
    });

    it("should detect new reviews on first poll", async () => {
      fetchReviews.mockImplementation(() => Promise.resolve([baseReview]));

      const onNewReviews = mock(() => {});
      const poller = createPoller({ onNewReviews });

      const result = await poller.poll();

      expect(result.success).toBe(true);
      expect(result.data?.newReviews).toHaveLength(1);
      expect(result.data?.newReviews[0].id).toBe(1);
      expect(onNewReviews).toHaveBeenCalledWith([baseReview]);
    });

    it("should detect new comments on first poll", async () => {
      fetchComments.mockImplementation(() => Promise.resolve([baseComment]));

      const onNewComments = mock(() => {});
      const poller = createPoller({ onNewComments });

      const result = await poller.poll();

      expect(result.success).toBe(true);
      expect(result.data?.newComments).toHaveLength(1);
      expect(onNewComments).toHaveBeenCalledWith([baseComment]);
    });

    it("should not report reviews as new on second poll if unchanged", async () => {
      fetchReviews.mockImplementation(() => Promise.resolve([baseReview]));

      const onNewReviews = mock(() => {});
      const poller = createPoller({ onNewReviews });

      await poller.poll(); // First poll - new review
      onNewReviews.mockClear();

      await poller.poll(); // Second poll - same review, not new

      expect(onNewReviews).not.toHaveBeenCalled();
    });

    it("should create notification for new review with CHANGES_REQUESTED as high priority", async () => {
      const changesRequestedReview: GitHubReview = {
        ...baseReview,
        state: "CHANGES_REQUESTED",
      };
      fetchReviews.mockImplementation(() => Promise.resolve([changesRequestedReview]));

      const poller = createPoller();

      await poller.poll();

      expect(mockCreateNotification).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          priority: "high",
          source_type: "github_pr_review",
        }),
      );
    });

    it("should create notification for new review with normal priority for non-CHANGES_REQUESTED", async () => {
      fetchReviews.mockImplementation(() => Promise.resolve([baseReview]));

      const poller = createPoller();

      await poller.poll();

      expect(mockCreateNotification).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          priority: "normal",
          source_type: "github_pr_review",
        }),
      );
    });

    it("should create notification for new comment", async () => {
      fetchComments.mockImplementation(() => Promise.resolve([baseComment]));

      const poller = createPoller();

      await poller.poll();

      expect(mockCreateNotification).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          source_type: "github_pr_comment",
          priority: "normal",
        }),
      );
    });

    it("should handle fetch errors gracefully", async () => {
      fetchReviews.mockImplementation(() => Promise.reject(new Error("Network error")));

      const onError = mock(() => {});
      const poller = createGitHubPoller({
        db,
        ticketId: "TICKET-1",
        prNumber: 42,
        interval: 5000,
        fetchReviews,
        fetchComments,
        onError,
      });

      const result = await poller.poll();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
      expect(onError).toHaveBeenCalled();
    });

    it("should set state to error on fetch failure", async () => {
      fetchReviews.mockImplementation(() => Promise.reject(new Error("API failure")));

      const poller = createGitHubPoller({
        db,
        ticketId: "TICKET-1",
        prNumber: 42,
        interval: 5000,
        fetchReviews,
        fetchComments,
      });

      await poller.poll();

      expect(poller.state).toBe("error");
    });

    it("should handle non-Error exceptions", async () => {
      fetchReviews.mockImplementation(() => Promise.reject("string error"));

      const onError = mock(() => {});
      const poller = createGitHubPoller({
        db,
        ticketId: "TICKET-1",
        prNumber: 42,
        interval: 5000,
        fetchReviews,
        fetchComments,
        onError,
      });

      const result = await poller.poll();

      expect(result.success).toBe(false);
      expect(result.error).toBe("string error");
    });

    it("should update lastResult after poll", async () => {
      const poller = createGitHubPoller({
        db,
        ticketId: "TICKET-1",
        prNumber: 42,
        interval: 5000,
        fetchReviews,
        fetchComments,
      });

      expect(poller.lastResult()).toBeNull();

      await poller.poll();

      expect(poller.lastResult()).not.toBeNull();
      expect(poller.lastResult()?.success).toBe(true);
    });

    it("should include prNumber and ticketId in poll data", async () => {
      const poller = createGitHubPoller({
        db,
        ticketId: "MY-TICKET",
        prNumber: 99,
        interval: 5000,
        fetchReviews,
        fetchComments,
      });

      const result = await poller.poll();

      expect(result.data?.ticketId).toBe("MY-TICKET");
      expect(result.data?.prNumber).toBe(99);
    });

    it("should not call onNewReviews when reviews array is empty", async () => {
      const onNewReviews = mock(() => {});
      const poller = createGitHubPoller({
        db,
        ticketId: "TICKET-1",
        prNumber: 42,
        interval: 5000,
        fetchReviews,
        fetchComments,
        onNewReviews,
      });

      await poller.poll();

      expect(onNewReviews).not.toHaveBeenCalled();
    });

    it("should not call onNewComments when comments array is empty", async () => {
      const onNewComments = mock(() => {});
      const poller = createGitHubPoller({
        db,
        ticketId: "TICKET-1",
        prNumber: 42,
        interval: 5000,
        fetchReviews,
        fetchComments,
        onNewComments,
      });

      await poller.poll();

      expect(onNewComments).not.toHaveBeenCalled();
    });
  });
});
