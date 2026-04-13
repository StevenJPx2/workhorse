/**
 * Type definitions for ReviewCommentCard component
 */

import type { CommentWithDraft } from "../../hooks/use-pr-review/types.ts";
import type { ReviewState } from "#core/github/types.ts";

/**
 * Props for the ReviewCommentCard component
 */
export interface ReviewCommentCardProps {
  /** Comment with draft reply data */
  commentWithDraft: CommentWithDraft;
  /** Review state for color coding */
  reviewState: ReviewState;
  /** Whether this comment is currently selected/focused */
  isSelected?: boolean;
  /** Whether the card is in edit mode for the draft reply */
  isEditing?: boolean;
  /** Callback when user wants to edit the draft reply */
  onEdit?: () => void;
  /** Callback when user submits a reply */
  onSubmitReply?: (commentId: number) => void;
  /** Callback when user wants to reply + address changes */
  onReplyAndAddress?: (commentId: number) => void;
  /** Callback when draft reply text changes */
  onDraftChange?: (commentId: number, text: string) => void;
}

/**
 * Configuration for review state display
 */
export interface ReviewStateConfig {
  /** Display color */
  color: string;
  /** Status indicator character */
  indicator: string;
  /** Human-readable label */
  label: string;
}

/**
 * Gets display configuration for a review state
 */
export function getReviewStateConfig(state: ReviewState): ReviewStateConfig {
  switch (state) {
    case "approved":
      return { color: "#32CD32", indicator: "✓", label: "Approved" };
    case "changes_requested":
      return { color: "#FF4444", indicator: "✗", label: "Changes Requested" };
    case "commented":
      return { color: "#808080", indicator: "●", label: "Commented" };
    case "pending":
      return { color: "#6B8E23", indicator: "◎", label: "Pending" };
  }
}
