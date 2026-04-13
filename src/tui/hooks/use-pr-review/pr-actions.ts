/**
 * PR review action creators
 *
 * Factory function that creates action methods for the PR review workflow,
 * extracted from the main hook for modularity.
 */

import type { CommentWithDraft, UsePRReviewDeps, UsePRReviewOptions } from "./types.ts";
import { MAX_REPLY_LENGTH } from "./utils.ts";

export interface ActionContext {
  owner: () => string;
  repo: () => string;
  prNumber: () => number;
  commentsWithDrafts: () => CommentWithDraft[];
  setError: (err: Error | null) => void;
  setCommentsWithDrafts: (fn: (prev: CommentWithDraft[]) => CommentWithDraft[]) => void;
  setIsSubmitting: (v: boolean) => void;
  options: UsePRReviewOptions;
  deps: UsePRReviewDeps;
}

export function createActions(ctx: ActionContext) {
  function setDraftReply(commentId: number, text: string): void {
    ctx.setCommentsWithDrafts((prev) =>
      prev.map((cwd) => (cwd.comment.id === commentId ? { ...cwd, draftReply: text } : cwd)),
    );
  }

  async function replyOnly(commentId: number): Promise<void> {
    const o = ctx.owner();
    const r = ctx.repo();
    const n = ctx.prNumber();
    if (!o || !r || !n) {
      ctx.setError(new Error("Owner, repo, and PR number are required"));
      return;
    }

    const item = ctx.commentsWithDrafts().find((cwd) => cwd.comment.id === commentId);
    if (!item) {
      ctx.setError(new Error(`Comment ${commentId} not found`));
      return;
    }

    ctx.setIsSubmitting(true);
    try {
      ctx.setError(null);
      const replyBody = item.draftReply.slice(0, MAX_REPLY_LENGTH);
      const inReplyTo = item.comment.inReplyToId ?? item.comment.id;
      await ctx.deps.createReviewComment(o, r, n, replyBody, inReplyTo);

      ctx.setCommentsWithDrafts((prev) =>
        prev.map((cwd) => (cwd.comment.id === commentId ? { ...cwd, isReplied: true } : cwd)),
      );

      ctx.deps.logEvent("comment", {
        source: "user",
        content: `Replied to PR review comment #${commentId}`,
        prNumber: n,
      });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      ctx.setError(e);
      ctx.options.onError?.(e);
      throw e;
    } finally {
      ctx.setIsSubmitting(false);
    }
  }

  async function replyAndAddressChanges(commentId: number): Promise<void> {
    await replyOnly(commentId);
    ctx.deps.logEvent("status_change", {
      from: "in_review",
      to: "planning",
      reason: "PR review feedback requires code changes",
      commentId,
    });
  }

  async function addressAllComments(): Promise<void> {
    const o = ctx.owner();
    const r = ctx.repo();
    const n = ctx.prNumber();
    if (!o || !r || !n) {
      ctx.setError(new Error("Owner, repo, and PR number are required"));
      return;
    }

    const unreplied = ctx.commentsWithDrafts().filter((cwd) => !cwd.isReplied);
    ctx.setIsSubmitting(true);
    try {
      ctx.setError(null);
      for (const item of unreplied) {
        const replyBody = item.draftReply.slice(0, MAX_REPLY_LENGTH);
        const inReplyTo = item.comment.inReplyToId ?? item.comment.id;
        await ctx.deps.createReviewComment(o, r, n, replyBody, inReplyTo);
      }

      ctx.setCommentsWithDrafts((prev) => prev.map((cwd) => ({ ...cwd, isReplied: true })));
      ctx.deps.logEvent("status_change", {
        from: "in_review",
        to: "planning",
        reason: "Addressing all PR review feedback",
        totalComments: unreplied.length,
      });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      ctx.setError(e);
      ctx.options.onError?.(e);
      throw e;
    } finally {
      ctx.setIsSubmitting(false);
    }
  }

  return { setDraftReply, replyOnly, replyAndAddressChanges, addressAllComments };
}
