/**
 * usePRReview hook - PR review workflow state management
 *
 * Manages the full PR review lifecycle:
 * - Polling for new reviews and comments (30s aggressive)
 * - Smart reply template generation
 * - Draft reply editing per comment
 * - Workflow actions: reply-only, reply+address, address-all
 */

import { createSignal, onCleanup } from "solid-js";
import type { GitHubPRReview, ReviewState } from "#core/github/types.ts";
import type {
  UsePRReviewOptions,
  UsePRReviewReturn,
  UsePRReviewDeps,
  CommentWithDraft,
} from "./types.ts";
import { generateSmartReply } from "./smart-reply.ts";
import { determineReviewState } from "./review-state.ts";
import { resolveValue, DEFAULT_POLL_INTERVAL } from "./utils.ts";
import { createActions } from "./pr-actions.ts";

export { generateSmartReply } from "./smart-reply.ts";

export function usePRReview(options: UsePRReviewOptions, deps: UsePRReviewDeps): UsePRReviewReturn {
  const [reviews, setReviews] = createSignal<GitHubPRReview[]>([]);
  const [commentsWithDrafts, setCommentsWithDrafts] = createSignal<CommentWithDraft[]>([]);
  const [reviewState, setReviewState] = createSignal<ReviewState>("pending");
  const [isPolling, setIsPolling] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  const [isSubmitting, setIsSubmitting] = createSignal(false);

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let knownReviewIds = new Set<number>();
  let knownCommentIds = new Set<number>();

  const owner = () => resolveValue(options.owner);
  const repo = () => resolveValue(options.repo);
  const prNumber = () => resolveValue(options.prNumber);

  async function refresh(): Promise<void> {
    const o = owner();
    const r = repo();
    const n = prNumber();

    if (!o || !r || !n) {
      setError(new Error("Owner, repo, and PR number are required"));
      return;
    }

    try {
      setError(null);

      const [fetchedReviews, fetchedComments] = await Promise.all([
        deps.listReviews(o, r, n),
        deps.listReviewComments(o, r, n),
      ]);

      const newReviews = fetchedReviews.filter((rev) => !knownReviewIds.has(rev.id));
      const newComments = fetchedComments.filter((c) => !knownCommentIds.has(c.id));

      knownReviewIds = new Set(fetchedReviews.map((rev) => rev.id));
      knownCommentIds = new Set(fetchedComments.map((c) => c.id));

      const newState = determineReviewState(fetchedReviews);
      setReviews(fetchedReviews);

      setCommentsWithDrafts((prev) => {
        const existingMap = new Map(prev.map((cwd) => [cwd.comment.id, cwd]));
        return fetchedComments.map((comment) => {
          const existing = existingMap.get(comment.id);
          if (existing) return { ...existing, comment };
          return {
            comment,
            draftReply: generateSmartReply(comment),
            isReplied: false,
          };
        });
      });

      if (newState !== reviewState()) {
        setReviewState(newState);
        options.onStateChange?.(newState);
      }

      if (newReviews.length > 0) options.onNewReviews?.(newReviews);
      if (newComments.length > 0) options.onNewComments?.(newComments);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      options.onError?.(e);
    }
  }

  const actions = createActions({
    owner,
    repo,
    prNumber,
    commentsWithDrafts,
    setError,
    setCommentsWithDrafts,
    setIsSubmitting,
    options,
    deps,
  });

  function startPolling(): void {
    if (isPolling()) return;
    setIsPolling(true);
    const interval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;
    refresh().catch(() => {});
    pollTimer = setInterval(() => {
      refresh().catch(() => {});
    }, interval);
  }

  function stopPolling(): void {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    setIsPolling(false);
  }

  if (options.autoStart !== false) startPolling();
  onCleanup(() => {
    stopPolling();
  });

  return {
    reviews,
    commentsWithDrafts,
    reviewState,
    isPolling,
    error,
    isSubmitting,
    ...actions,
    generateSmartReply,
    refresh,
    startPolling,
    stopPolling,
  };
}
