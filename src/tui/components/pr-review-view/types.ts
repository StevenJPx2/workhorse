/**
 * Type definitions for PRReviewView component
 */

import type { UsePRReviewReturn } from "../../hooks/use-pr-review/types.ts";
import type { ReviewState } from "#core/github/types.ts";

/**
 * Props for the PRReviewView component
 */
export interface PRReviewViewProps {
  /** PR URL for "Open in GitHub" fallback */
  prUrl: string;
  /** PR review hook return (provides state and actions) */
  prReview: UsePRReviewReturn;
  /** Currently selected comment index (for navigation) */
  selectedIndex?: number;
  /** Whether the selected comment is in edit mode */
  isEditing?: boolean;
  /** Callback: start editing a comment's draft */
  onEdit?: (commentId: number) => void;
  /** Callback: navigate to a comment by index */
  onSelect?: (index: number) => void;
}

/**
 * Display configuration for a review state
 */
export interface ReviewStateDisplay {
  icon: string;
  label: string;
  color: string;
}

/**
 * Maps review state to display text and icon for the header
 */
export function getReviewStateDisplay(state: ReviewState): ReviewStateDisplay {
  switch (state) {
    case "approved":
      return { icon: "✓", label: "Approved", color: "#32CD32" };
    case "changes_requested":
      return { icon: "✗", label: "Changes Requested", color: "#FF4444" };
    case "commented":
      return { icon: "●", label: "Commented", color: "#808080" };
    case "pending":
      return { icon: "◎", label: "Pending Review", color: "#6B8E23" };
  }
}
