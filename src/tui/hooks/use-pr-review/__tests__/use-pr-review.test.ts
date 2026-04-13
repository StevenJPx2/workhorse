/**
 * Tests for usePRReview hook
 *
 * Uses dependency injection for all GitHub client calls.
 */

import { describe, it, expect, mock } from "bun:test";
import { createRoot } from "solid-js";
import { usePRReview } from "../use-pr-review.ts";
import { generateSmartReply } from "../smart-reply.ts";
import type { UsePRReviewDeps } from "../types.ts";
import type { GitHubPRReview, GitHubReviewComment } from "#core/github/types.ts";

const baseReview: GitHubPRReview = {
  id: 1,
  user: "reviewer",
  state: "CHANGES_REQUESTED",
  body: "Please fix this",
  submittedAt: "2025-01-01T12:00:00Z",
};

const baseComment: GitHubReviewComment = {
  id: 100,
  reviewId: 1,
  user: "reviewer",
  body: "Consider using exponential backoff",
  path: "src/auth.ts",
  line: 42,
  originalLine: 42,
  side: "RIGHT",
  isResolved: false,
  createdAt: "2025-01-01T12:00:00Z",
  updatedAt: "2025-01-01T12:00:00Z",
  inReplyToId: null,
};

function createMockDeps(overrides: Partial<UsePRReviewDeps> = {}): UsePRReviewDeps {
  return {
    listReviews: mock(async () => [baseReview]),
    listReviewComments: mock(async () => [baseComment]),
    createReviewComment: mock(async () => {}),
    createReview: mock(async () => {}),
    updateTicketStatus: mock(async () => {}),
    logEvent: mock(() => {}),
    ...overrides,
  };
}

describe("generateSmartReply", () => {
  it("generates bug-fix reply", () => {
    const comment = { ...baseComment, body: "This is a bug that causes errors" };
    expect(generateSmartReply(comment)).toBe("Good catch! I'll fix this issue.");
  });

  it("generates test-related reply", () => {
    const comment = { ...baseComment, body: "Add unit test coverage" };
    expect(generateSmartReply(comment)).toBe(
      "Thanks for the testing feedback. I'll add the necessary tests.",
    );
  });

  it("generates nit/style reply", () => {
    const comment = { ...baseComment, body: "Nit: fix formatting here" };
    expect(generateSmartReply(comment)).toBe("Good point, I'll clean this up.");
  });

  it("generates security reply", () => {
    const comment = { ...baseComment, body: "Security vulnerability in input sanitization" };
    expect(generateSmartReply(comment)).toBe(
      "Important security concern. I'll address this right away.",
    );
  });

  it("generates performance reply", () => {
    const comment = { ...baseComment, body: "This is slow, n+1 query" };
    expect(generateSmartReply(comment)).toBe(
      "Thanks for the performance suggestion. I'll optimize this.",
    );
  });

  it("generates docs reply", () => {
    const comment = { ...baseComment, body: "Add documentation for this API" };
    expect(generateSmartReply(comment)).toBe("Good call, I'll add the documentation.");
  });

  it("generates refactor reply", () => {
    const comment = { ...baseComment, body: "Please refactor and rename this method" };
    expect(generateSmartReply(comment)).toBe("Great suggestion, I'll refactor this.");
  });

  it("generates default reply for unmatched comments", () => {
    const comment = { ...baseComment, body: "What do you think about this?" };
    expect(generateSmartReply(comment)).toBe("Thanks for the feedback! I'll address this.");
  });
});

describe("usePRReview", () => {
  it("initializes with empty state", () => {
    const deps = createMockDeps({
      listReviews: mock(async () => []),
      listReviewComments: mock(async () => []),
    });

    createRoot((dispose) => {
      const hook = usePRReview(
        { owner: "test", repo: "repo", prNumber: 42, autoStart: false },
        deps,
      );

      expect(hook.reviews()).toEqual([]);
      expect(hook.commentsWithDrafts()).toEqual([]);
      expect(hook.reviewState()).toBe("pending");
      expect(hook.isPolling()).toBe(false);
      expect(hook.error()).toBeNull();
      expect(hook.isSubmitting()).toBe(false);
      dispose();
    });
  });

  it("refresh loads reviews and comments", async () => {
    const reviews: GitHubPRReview[] = [
      { ...baseReview, id: 1, state: "CHANGES_REQUESTED", user: "alice" },
    ];
    const comments: GitHubReviewComment[] = [{ ...baseComment, id: 100, body: "Fix this bug" }];
    const deps = createMockDeps({
      listReviews: mock(async () => reviews),
      listReviewComments: mock(async () => comments),
    });

    await createRoot(async (dispose) => {
      const hook = usePRReview(
        { owner: "test", repo: "repo", prNumber: 42, autoStart: false },
        deps,
      );

      await hook.refresh();

      expect(hook.reviews()).toHaveLength(1);
      expect(hook.reviewState()).toBe("changes_requested");
      expect(hook.commentsWithDrafts()).toHaveLength(1);
      expect(hook.commentsWithDrafts()[0].draftReply).toBe("Good catch! I'll fix this issue.");
      dispose();
    });
  });

  it("generates smart replies for new comments", async () => {
    const deps = createMockDeps({
      listReviews: mock(async () => []),
      listReviewComments: mock(async () => [
        { ...baseComment, id: 1, body: "This needs more test coverage" },
        { ...baseComment, id: 2, body: "Nit: remove extra whitespace" },
      ]),
    });

    await createRoot(async (dispose) => {
      const hook = usePRReview(
        { owner: "test", repo: "repo", prNumber: 42, autoStart: false },
        deps,
      );

      await hook.refresh();
      const drafts = hook.commentsWithDrafts();

      expect(drafts[0].draftReply).toBe(
        "Thanks for the testing feedback. I'll add the necessary tests.",
      );
      expect(drafts[1].draftReply).toBe("Good point, I'll clean this up.");
      dispose();
    });
  });

  it("setDraftReply updates a specific comment's draft", async () => {
    const deps = createMockDeps({
      listReviews: mock(async () => []),
      listReviewComments: mock(async () => [{ ...baseComment, id: 1 }]),
    });

    await createRoot(async (dispose) => {
      const hook = usePRReview(
        { owner: "test", repo: "repo", prNumber: 42, autoStart: false },
        deps,
      );

      await hook.refresh();
      hook.setDraftReply(1, "My custom reply");

      expect(hook.commentsWithDrafts()[0].draftReply).toBe("My custom reply");
      dispose();
    });
  });

  it("determines review state correctly", async () => {
    const deps = createMockDeps({
      listReviews: mock(async () => [
        { ...baseReview, id: 1, user: "alice", state: "APPROVED" },
        { ...baseReview, id: 2, user: "bob", state: "CHANGES_REQUESTED" },
      ]),
      listReviewComments: mock(async () => []),
    });

    await createRoot(async (dispose) => {
      const hook = usePRReview(
        { owner: "test", repo: "repo", prNumber: 42, autoStart: false },
        deps,
      );

      await hook.refresh();
      expect(hook.reviewState()).toBe("changes_requested");
      dispose();
    });
  });

  it("marks comments as approved when all approved", async () => {
    const deps = createMockDeps({
      listReviews: mock(async () => [
        { ...baseReview, id: 1, user: "alice", state: "APPROVED" },
        { ...baseReview, id: 2, user: "bob", state: "APPROVED" },
      ]),
      listReviewComments: mock(async () => []),
    });

    await createRoot(async (dispose) => {
      const hook = usePRReview(
        { owner: "test", repo: "repo", prNumber: 42, autoStart: false },
        deps,
      );

      await hook.refresh();
      expect(hook.reviewState()).toBe("approved");
      dispose();
    });
  });

  it("replyOnly posts a reply and marks as replied", async () => {
    const createComment = mock(async () => {});
    const deps = createMockDeps({
      listReviews: mock(async () => []),
      listReviewComments: mock(async () => [{ ...baseComment, id: 100 }]),
      createReviewComment: createComment,
    });

    await createRoot(async (dispose) => {
      const hook = usePRReview(
        { owner: "test", repo: "repo", prNumber: 42, autoStart: false },
        deps,
      );

      await hook.refresh();
      hook.setDraftReply(100, "My custom reply");
      await hook.replyOnly(100);

      expect(createComment).toHaveBeenCalledWith("test", "repo", 42, "My custom reply", 100);
      expect(hook.commentsWithDrafts()[0].isReplied).toBe(true);
      dispose();
    });
  });

  it("addressAllComments replies to all unreplied comments", async () => {
    const createComment = mock(async () => {});
    const deps = createMockDeps({
      listReviews: mock(async () => []),
      listReviewComments: mock(async () => [
        { ...baseComment, id: 100, body: "Fix this bug" },
        { ...baseComment, id: 101, body: "Add tests" },
      ]),
      createReviewComment: createComment,
    });

    await createRoot(async (dispose) => {
      const hook = usePRReview(
        { owner: "test", repo: "repo", prNumber: 42, autoStart: false },
        deps,
      );

      await hook.refresh();
      await hook.addressAllComments();

      expect(createComment).toHaveBeenCalledTimes(2);
      expect(hook.commentsWithDrafts().every((c) => c.isReplied)).toBe(true);
      dispose();
    });
  });

  it("handles errors from GitHub API", async () => {
    const deps = createMockDeps({
      listReviews: mock(async () => {
        throw new Error("API error");
      }),
      listReviewComments: mock(async () => []),
    });

    const capturedErrors: Error[] = [];

    await createRoot(async (dispose) => {
      const hook = usePRReview(
        {
          owner: "test",
          repo: "repo",
          prNumber: 42,
          autoStart: false,
          onError: (err) => capturedErrors.push(err),
        },
        deps,
      );

      await hook.refresh();

      expect(hook.error()).not.toBeNull();
      expect(hook.error()?.message).toBe("API error");
      expect(capturedErrors.length).toBe(1);
      dispose();
    });
  });
});
