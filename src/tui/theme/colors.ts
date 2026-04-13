/**
 * Color palette for Jiratown TUI
 */

export const colors = {
  // Primary brand colors
  primary: "#00BFFF", // Deep sky blue - main accent
  primaryBright: "#40E0FF", // Brighter primary for hover
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
  success: "#2E8B57", // Sea green
  successBright: "#3CB371", // Brighter green for hover
  warning: "#DAA520", // Goldenrod
  warningBright: "#FFD700", // Brighter gold for hover
  error: "#CD5C5C", // Indian red
  errorBright: "#FF6B6B", // Brighter red for hover
  info: "#00BFFF", // Sky blue
  infoBright: "#40D4FF", // Brighter blue for hover

  // Agent colors
  agent: {
    opencode: "#00D9FF", // Cyan for OpenCode
    claude: "#DA7756", // Orange/terracotta for Claude
  },
} as const;
