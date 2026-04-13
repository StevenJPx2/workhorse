/**
 * ReviewCommentCard component - Displays a PR review comment with draft reply
 *
 * Shows:
 * - Comment header (author, file/line, timestamp)
 * - Comment body text
 * - Draft reply area (when editing or has draft)
 * - Action hints (Reply, Reply + Address)
 *
 * @example
 * <ReviewCommentCard
 *   commentWithDraft={commentWithDraft}
 *   reviewState="changes_requested"
 *   isSelected={true}
 *   onEdit={() => setEditingId(comment.id)}
 * />
 */

import { Show } from "solid-js";
import { useTheme, spacing } from "../../theme/index.ts";
import type { ReviewCommentCardProps } from "./types.ts";
import { getReviewStateConfig } from "./types.ts";

/**
 * Formats a file path and line number for display
 */
function formatLocation(path: string | null, line: number | null): string {
  if (!path) return "";
  if (line !== null) return `${path}:${line}`;
  return path;
}

/**
 * Formats an ISO timestamp for compact display
 */
function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

/**
 * Renders a single PR review comment with optional draft reply
 */
export function ReviewCommentCard(props: ReviewCommentCardProps) {
  const { theme } = useTheme();
  const { comment, draftReply, isReplied } = props.commentWithDraft;

  const stateConfig = () => getReviewStateConfig(props.reviewState);
  const isSelected = () => props.isSelected ?? false;
  const isEditing = () => props.isEditing ?? false;

  const location = () => formatLocation(comment.path, comment.line);
  const timeAgo = () => formatTimestamp(comment.createdAt);

  const borderColor = () =>
    isSelected() ? theme().primary : isReplied ? theme().success : stateConfig().color;

  const hasDraft = () => draftReply.length > 0;

  return (
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={borderColor()}
      backgroundColor={isSelected() ? theme().bg.highlight : theme().bg.elevated}
      padding={spacing.sm}
    >
      {/* Header row: author + location + status */}
      <box flexDirection="row" justifyContent="space-between">
        <box flexDirection="row" gap={1}>
          <text fg={theme().primary}>{comment.user}</text>
          <Show when={location()}>
            <text fg={theme().text.dim}>{location()}</text>
          </Show>
        </box>
        <box flexDirection="row" gap={1}>
          <Show when={isReplied}>
            <text fg={theme().success}>✓ replied</text>
          </Show>
          <text fg={theme().text.dim}>{timeAgo()}</text>
        </box>
      </box>

      {/* Comment body */}
      <box flexDirection="column" marginTop={1}>
        <text fg={theme().text.secondary}>{comment.body}</text>
      </box>

      {/* Draft reply area */}
      <Show when={isEditing() || hasDraft()}>
        <box
          flexDirection="column"
          marginTop={1}
          border
          borderStyle="single"
          borderColor={theme().border.dim}
          padding={spacing.sm}
        >
          <text fg={theme().text.dim} marginBottom={1}>
            Draft reply:
          </text>
          <Show when={isEditing()}>
            <text fg={theme().text.primary}>{draftReply}</text>
          </Show>
          <Show when={!isEditing()}>
            <text fg={theme().text.secondary}>{draftReply}</text>
          </Show>
        </box>
      </Show>

      {/* Action hints */}
      <Show when={isSelected() && !isReplied}>
        <box flexDirection="row" gap={2} marginTop={1}>
          <text fg={theme().info}>[R] Reply</text>
          <text fg={theme().warning}>[A] Reply + Address</text>
          <text fg={theme().text.dim}>[E] Edit draft</text>
        </box>
      </Show>
    </box>
  );
}
