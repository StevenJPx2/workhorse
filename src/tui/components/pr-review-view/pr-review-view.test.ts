/**
 * Tests for PRReviewView component
 */

import { describe, test, expect } from "bun:test";
import { getReviewStateDisplay, type PRReviewViewProps } from "./types.ts";
import type { CommentWithDraft, UsePRReviewReturn } from "../../hooks/use-pr-review/types.ts";
import type { GitHubReviewComment, ReviewState } from "#core/github/types.ts";

function makeComment(overrides: Partial<GitHubReviewComment> = {}): GitHubReviewComment {
  return {
    id: 1,
    reviewId: null,
    user: "reviewer",
    body: "Please fix this",
    path: "src/app.ts",
    line: 42,
    originalLine: 42,
    side: "RIGHT",
    isResolved: false,
    createdAt: "2025-01-15T10:00:00Z",
    updatedAt: "2025-01-15T10:00:00Z",
    inReplyToId: null,
    ...overrides,
  };
}

function makeCommentWithDraft(
  overrides: Partial<CommentWithDraft> = {},
  commentOverrides: Partial<GitHubReviewComment> = {},
): CommentWithDraft {
  return {
    comment: makeComment(commentOverrides),
    draftReply: "Thanks for the feedback!",
    isReplied: false,
    ...overrides,
  };
}

describe("getReviewStateDisplay", () => {
  test("approved returns checkmark", () => {
    const display = getReviewStateDisplay("approved");
    expect(display.icon).toBe("✓");
    expect(display.label).toBe("Approved");
    expect(display.color).toBe("#32CD32");
  });

  test("changes_requested returns X mark", () => {
    const display = getReviewStateDisplay("changes_requested");
    expect(display.icon).toBe("✗");
    expect(display.label).toBe("Changes Requested");
    expect(display.color).toBe("#FF4444");
  });

  test("commented returns bullet", () => {
    const display = getReviewStateDisplay("commented");
    expect(display.icon).toBe("●");
    expect(display.label).toBe("Commented");
    expect(display.color).toBe("#808080");
  });

  test("pending returns circle dot", () => {
    const display = getReviewStateDisplay("pending");
    expect(display.icon).toBe("◎");
    expect(display.label).toBe("Pending Review");
    expect(display.color).toBe("#6B8E23");
  });
});

function makePRReview(overrides: Partial<UsePRReviewReturn> = {}): UsePRReviewReturn {
  return {
    reviews: () => [],
    commentsWithDrafts: () => [],
    reviewState: () => "pending" as ReviewState,
    isPolling: () => false,
    error: () => null,
    isSubmitting: () => false,
    setDraftReply: () => {},
    generateSmartReply: () => "",
    replyOnly: async () => {},
    replyAndAddressChanges: async () => {},
    addressAllComments: async () => {},
    refresh: async () => {},
    startPolling: () => {},
    stopPolling: () => {},
    ...overrides,
  };
}

describe("PRReviewViewProps type structure", () => {
  test("accepts required fields with prReview hook return", () => {
    const prReview = makePRReview({ reviewState: () => "changes_requested" });
    const props: PRReviewViewProps = {
      prUrl: "https://github.com/org/repo/pull/1",
      prReview,
    };
    expect(props.prReview).toBe(prReview);
    expect(props.prReview.reviewState()).toBe("changes_requested");
  });

  test("delegates state access to prReview", () => {
    const cwd1 = makeCommentWithDraft({}, { id: 1, body: "Fix the bug" });
    const cwd2 = makeCommentWithDraft({ isReplied: true }, { id: 2, body: "Nice code" });
    const prReview = makePRReview({
      reviewState: () => "changes_requested",
      commentsWithDrafts: () => [cwd1, cwd2],
    });
    const props: PRReviewViewProps = {
      prUrl: "https://github.com/org/repo/pull/42",
      prReview,
    };
    expect(props.prReview.commentsWithDrafts()).toHaveLength(2);
    expect(props.prReview.commentsWithDrafts()[0].comment.id).toBe(1);
    expect(props.prReview.commentsWithDrafts()[1].isReplied).toBe(true);
  });

  test("optional fields default to undefined", () => {
    const prReview = makePRReview();
    const props: PRReviewViewProps = {
      prUrl: "https://github.com/owner/repo/pull/1",
      prReview,
    };
    expect(props.selectedIndex).toBeUndefined();
    expect(props.isEditing).toBeUndefined();
    expect(props.onEdit).toBeUndefined();
    expect(props.onSelect).toBeUndefined();
  });

  test("accepts all optional fields", () => {
    const onEdit = (_id: number) => {};
    const onSelect = (_idx: number) => {};
    const prReview = makePRReview();
    const props: PRReviewViewProps = {
      prUrl: "https://github.com/org/repo/pull/1",
      prReview,
      selectedIndex: 0,
      isEditing: false,
      onEdit,
      onSelect,
    };
    expect(props.selectedIndex).toBe(0);
    expect(props.isEditing).toBe(false);
  });
});

describe("CommentWithDraft data interactions", () => {
  test("unresolved comments are shown in review", () => {
    const unresolved = makeCommentWithDraft(
      { isReplied: false },
      { isResolved: false, body: "This needs work" },
    );
    expect(unresolved.comment.isResolved).toBe(false);
    expect(unresolved.isReplied).toBe(false);
  });

  test("resolved comments can be filtered out", () => {
    const comments = [
      makeCommentWithDraft({}, { id: 1, isResolved: false }),
      makeCommentWithDraft({}, { id: 2, isResolved: true }),
      makeCommentWithDraft({}, { id: 3, isResolved: false }),
    ];
    const unresolved = comments.filter((c) => !c.comment.isResolved);
    expect(unresolved).toHaveLength(2);
  });

  test("inline comments have file context", () => {
    const inline = makeCommentWithDraft(
      {},
      {
        path: "src/utils.ts",
        line: 15,
        side: "RIGHT",
      },
    );
    expect(inline.comment.path).toBe("src/utils.ts");
    expect(inline.comment.line).toBe(15);
  });
});
