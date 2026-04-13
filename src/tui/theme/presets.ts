/**
 * Spacing, border styles, and component presets for Jiratown TUI
 */

import { colors } from "./colors.ts";

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
