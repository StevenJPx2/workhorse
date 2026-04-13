/**
 * PRReviewView component - Full PR review view for TicketPane
 *
 * Shows:
 * - Review state header (approved/changes_requested/commented/pending)
 * - Scrollable list of review comments with draft replies
 * - Error state with "Open in GitHub" fallback
 * - Polling indicator
 *
 * @example
 * <PRReviewView
 *   prUrl="https://github.com/org/repo/pull/42"
 *   prReview={prReviewHook}
 * />
 */

import { For, Show } from "solid-js";
import { useTheme, spacing } from "../../theme/index.ts";
import { ReviewCommentCard } from "../review-comment-card/index.ts";
import { getReviewStateDisplay } from "./types.ts";
import type { PRReviewViewProps } from "./types.ts";

/**
 * Truncates a URL for display
 */
function truncateUrl(url: string, maxLen: number): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen - 3) + "...";
}

/**
 * PR review view with comments and workflow actions
 */
export function PRReviewView(props: PRReviewViewProps) {
  const { theme } = useTheme();
  const pr = () => props.prReview;

  const stateDisplay = () => getReviewStateDisplay(pr().reviewState());
  const comments = () => pr().commentsWithDrafts();
  const hasComments = () => comments().length > 0;
  const hasError = () => Boolean(pr().error());

  return (
    <box flexDirection="column" flexGrow={1} gap={spacing.sm}>
      {/* Review state header */}
      <box flexDirection="row" justifyContent="space-between">
        <box flexDirection="row" gap={1}>
          <text fg={stateDisplay().color}>{stateDisplay().icon}</text>
          <text fg={stateDisplay().color}>{stateDisplay().label}</text>
          <text fg={theme().text.dim}>
            ({comments().length} comment{comments().length !== 1 ? "s" : ""})
          </text>
        </box>
        <box flexDirection="row" gap={1}>
          <Show when={pr().isPolling()}>
            <text fg={theme().text.dim}>● polling</text>
          </Show>
          <Show when={pr().isSubmitting()}>
            <text fg={theme().warning}>⏳ submitting</text>
          </Show>
        </box>
      </box>

      {/* Error state with Open in GitHub fallback */}
      <Show when={hasError()}>
        <box
          flexDirection="column"
          border
          borderStyle="single"
          borderColor={theme().error}
          padding={spacing.sm}
        >
          <text fg={theme().error}>Error: {pr().error()?.message ?? "Unknown error"}</text>
          <box flexDirection="row" gap={1} marginTop={1}>
            <text fg={theme().text.dim}>Open in GitHub:</text>
            <text fg={theme().primary}>{truncateUrl(props.prUrl, 50)}</text>
          </box>
        </box>
      </Show>

      {/* Empty state */}
      <Show when={!hasComments() && !hasError()}>
        <box
          flexDirection="column"
          border
          borderStyle="rounded"
          borderColor={theme().border.dim}
          padding={spacing.md}
        >
          <text fg={theme().text.dim}>No review comments yet.</text>
          <Show when={pr().isPolling()}>
            <text fg={theme().text.dim} marginTop={1}>
              Monitoring for new comments...
            </text>
          </Show>
        </box>
      </Show>

      {/* Comment list */}
      <Show when={hasComments()}>
        <box flexDirection="column" gap={spacing.sm} flexGrow={1}>
          <For each={comments()}>
            {(cwd, index) => (
              <ReviewCommentCard
                commentWithDraft={cwd}
                reviewState={pr().reviewState()}
                isSelected={props.selectedIndex === index()}
                isEditing={props.isEditing && props.selectedIndex === index()}
                onEdit={() => props.onEdit?.(cwd.comment.id)}
                onSubmitReply={(id) => pr().replyOnly(id)}
                onReplyAndAddress={(id) => pr().replyAndAddressChanges(id)}
                onDraftChange={(id, text) => pr().setDraftReply(id, text)}
              />
            )}
          </For>
        </box>
      </Show>

      {/* Address all + Refresh actions */}
      <Show when={hasComments() && !hasError()}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme().text.dim}>[a] Address all [r] Refresh</text>
          <text fg={theme().text.dim}>↑↓ navigate [e] edit</text>
        </box>
      </Show>
    </box>
  );
}
