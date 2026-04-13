/**
 * Tests for ReviewCommentCard component
 */

import { describe, test, expect } from "bun:test";
import { getReviewStateConfig } from "./types.ts";
import type { ReviewCommentCardProps } from "./types.ts";
import type { CommentWithDraft } from "../../hooks/use-pr-review/types.ts";
import type { GitHubReviewComment, ReviewState } from "#core/github/types.ts";

function makeComment(overrides: Partial<GitHubReviewComment> = {}): GitHubReviewComment {
  return {
    id: 1,
    reviewId: null,
    user: "reviewer",
    body: "Looks good overall",
    path: null,
    line: null,
    originalLine: null,
    side: null,
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
    draftReply: "",
    isReplied: false,
    ...overrides,
  };
}

describe("getReviewStateConfig", () => {
  test("returns approved config", () => {
    const config = getReviewStateConfig("approved");
    expect(config.color).toBe("#32CD32");
    expect(config.indicator).toBe("✓");
    expect(config.label).toBe("Approved");
  });

  test("returns changes_requested config", () => {
    const config = getReviewStateConfig("changes_requested");
    expect(config.color).toBe("#FF4444");
    expect(config.indicator).toBe("✗");
    expect(config.label).toBe("Changes Requested");
  });

  test("returns commented config", () => {
    const config = getReviewStateConfig("commented");
    expect(config.color).toBe("#808080");
    expect(config.indicator).toBe("●");
    expect(config.label).toBe("Commented");
  });

  test("returns pending config", () => {
    const config = getReviewStateConfig("pending");
    expect(config.color).toBe("#6B8E23");
    expect(config.indicator).toBe("◎");
    expect(config.label).toBe("Pending");
  });
});

describe("ReviewCommentCardProps", () => {
  test("creates props with required fields", () => {
    const cwd = makeCommentWithDraft();
    const props: ReviewCommentCardProps = {
      commentWithDraft: cwd,
      reviewState: "changes_requested",
    };
    expect(props.commentWithDraft).toBe(cwd);
    expect(props.reviewState).toBe("changes_requested");
  });

  test("optional fields default to undefined", () => {
    const cwd = makeCommentWithDraft();
    const props: ReviewCommentCardProps = {
      commentWithDraft: cwd,
      reviewState: "approved",
    };
    expect(props.isSelected).toBeUndefined();
    expect(props.isEditing).toBeUndefined();
    expect(props.onEdit).toBeUndefined();
    expect(props.onSubmitReply).toBeUndefined();
    expect(props.onReplyAndAddress).toBeUndefined();
    expect(props.onDraftChange).toBeUndefined();
  });

  test("accepts all optional fields", () => {
    const cwd = makeCommentWithDraft();
    const onEdit = () => {};
    const onSubmit = (_id: number) => {};
    const onAddress = (_id: number) => {};
    const onDraft = (_id: number, _text: string) => {};

    const props: ReviewCommentCardProps = {
      commentWithDraft: cwd,
      reviewState: "commented",
      isSelected: true,
      isEditing: false,
      onEdit,
      onSubmitReply: onSubmit,
      onReplyAndAddress: onAddress,
      onDraftChange: onDraft,
    };

    expect(props.isSelected).toBe(true);
    expect(props.isEditing).toBe(false);
    expect(props.onEdit).toBe(onEdit);
    expect(props.onSubmitReply).toBe(onSubmit);
    expect(props.onReplyAndAddress).toBe(onAddress);
    expect(props.onDraftChange).toBe(onDraft);
  });
});

describe("ReviewStateConfig colors", () => {
  const states: ReviewState[] = ["approved", "changes_requested", "commented", "pending"];

  test.each(states)("config for %s has a valid hex color", (state) => {
    const config = getReviewStateConfig(state);
    expect(config.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  test.each(states)("config for %s has a non-empty indicator", (state) => {
    const config = getReviewStateConfig(state);
    expect(config.indicator.length).toBeGreaterThan(0);
  });

  test.each(states)("config for %s has a non-empty label", (state) => {
    const config = getReviewStateConfig(state);
    expect(config.label.length).toBeGreaterThan(0);
  });
});

describe("Comment data structure", () => {
  test("inline comment has path and line", () => {
    const cwd = makeCommentWithDraft(
      {},
      {
        path: "src/app.ts",
        line: 42,
      },
    );
    expect(cwd.comment.path).toBe("src/app.ts");
    expect(cwd.comment.line).toBe(42);
  });

  test("general comment has no path or line", () => {
    const cwd = makeCommentWithDraft();
    expect(cwd.comment.path).toBeNull();
    expect(cwd.comment.line).toBeNull();
  });

  test("comment with draft reply", () => {
    const cwd = makeCommentWithDraft({
      draftReply: "Thanks for the feedback!",
      isReplied: false,
    });
    expect(cwd.draftReply).toBe("Thanks for the feedback!");
    expect(cwd.isReplied).toBe(false);
  });

  test("replied comment", () => {
    const cwd = makeCommentWithDraft({
      draftReply: "Fixed in abc123",
      isReplied: true,
    });
    expect(cwd.isReplied).toBe(true);
  });
});
