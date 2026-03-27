/**
 * Theme constants for Jiratown TUI
 *
 * Defines color palette, status colors, and styling utilities
 */

// =============================================================================
// Color Palette
// =============================================================================

export const colors = {
  // Primary brand colors
  primary: "#00BFFF", // Deep sky blue - main accent
  primaryDim: "#0088BB", // Dimmed primary for borders
  secondary: "#9370DB", // Medium purple - secondary accent

  // Background colors
  bg: {
    shell: "#101020", // Darkest - outer shell/chrome
    base: "#1A1A2E", // Dark navy - main content areas
    elevated: "#252542", // Slightly lighter for elevated surfaces
    highlight: "#2E2E4A", // Hover/selected background
    input: "#16213E", // Input field background
  },

  // Text colors
  text: {
    primary: "#E8E8E8", // Main text
    secondary: "#A0A0A0", // Secondary/muted text
    dim: "#606060", // Very dim text
    inverse: "#1A1A2E", // Text on light backgrounds
  },

  // Border colors
  border: {
    default: "#404060", // Default border
    focus: "#00BFFF", // Focused element border
    dim: "#303050", // Dimmed border
  },

  // Status colors (for ticket states)
  status: {
    pending: "#808080", // Gray - waiting
    queued: "#6B8E23", // Olive - in queue
    planning: "#4169E1", // Royal blue - planning phase
    implementing: "#FFD700", // Gold - actively working
    blocked: "#FF4444", // Red - needs attention
    pr_created: "#9370DB", // Purple - PR exists
    in_review: "#DA70D6", // Orchid - under review
    done: "#32CD32", // Lime green - completed
  },

  // Semantic colors
  success: "#32CD32", // Lime green
  warning: "#FFD700", // Gold
  error: "#FF4444", // Red
  info: "#00BFFF", // Sky blue

  // Agent colors
  agent: {
    opencode: "#00D9FF", // Cyan for OpenCode
    claude: "#DA7756", // Orange/terracotta for Claude
  },
} as const;

// =============================================================================
// Status Display Configuration
// =============================================================================

export interface StatusConfig {
  color: string;
  label: string;
  indicator: string;
}

export const statusConfig: Record<string, StatusConfig> = {
  pending: {
    color: colors.status.pending,
    label: "PENDING",
    indicator: "○",
  },
  queued: {
    color: colors.status.queued,
    label: "QUEUED",
    indicator: "◎",
  },
  planning: {
    color: colors.status.planning,
    label: "PLANNING",
    indicator: "◐",
  },
  implementing: {
    color: colors.status.implementing,
    label: "IMPLEMENTING",
    indicator: "▶",
  },
  blocked: {
    color: colors.status.blocked,
    label: "BLOCKED",
    indicator: "!",
  },
  pr_created: {
    color: colors.status.pr_created,
    label: "PR CREATED",
    indicator: "⬆",
  },
  in_review: {
    color: colors.status.in_review,
    label: "IN REVIEW",
    indicator: "◉",
  },
  done: {
    color: colors.status.done,
    label: "DONE",
    indicator: "✓",
  },
};

/**
 * Get status configuration for a given status string
 */
export function getStatusConfig(status: string): StatusConfig {
  return (
    statusConfig[status] ?? {
      color: colors.text.secondary,
      label: status.toUpperCase(),
      indicator: "?",
    }
  );
}

// =============================================================================
// Spacing & Layout Constants
// =============================================================================

export const spacing = {
  xs: 0,
  sm: 1,
  md: 2,
  lg: 3,
  xl: 4,
} as const;

export const borderStyles = {
  none: undefined,
  single: "single",
  double: "double",
  round: "round",
  bold: "bold",
} as const;

// =============================================================================
// Component Style Presets
// =============================================================================

/**
 * Preset styles for common UI patterns
 */
export const presets = {
  // Card-like container
  card: {
    border: borderStyles.round,
    borderColor: colors.border.default,
    padding: spacing.sm,
  },

  // Focused/selected card
  cardFocused: {
    border: borderStyles.round,
    borderColor: colors.primary,
    backgroundColor: colors.bg.highlight,
    padding: spacing.sm,
  },

  // Panel header
  panelHeader: {
    borderBottom: borderStyles.single,
    borderColor: colors.border.dim,
    paddingLeft: spacing.sm,
    paddingRight: spacing.sm,
  },

  // Modal overlay
  modal: {
    border: borderStyles.round,
    borderColor: colors.primary,
    backgroundColor: colors.bg.elevated,
    padding: spacing.sm,
  },

  // Button-like element
  button: {
    border: borderStyles.single,
    borderColor: colors.border.default,
    paddingLeft: spacing.sm,
    paddingRight: spacing.sm,
  },

  // Primary action button
  buttonPrimary: {
    border: borderStyles.single,
    borderColor: colors.primary,
    paddingLeft: spacing.sm,
    paddingRight: spacing.sm,
  },
} as const;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the color for a specific agent type
 */
export function getAgentColor(agent: string): string {
  if (agent === "claude") {
    return colors.agent.claude;
  }
  return colors.agent.opencode;
}

/**
 * Format a key shortcut for display
 */
export function formatKeyHint(key: string, action: string): string {
  return `[${key}] ${action}`;
}

/**
 * Create a divider string of specified width
 */
export function createDivider(width: number, char = "─"): string {
  return char.repeat(width);
}
