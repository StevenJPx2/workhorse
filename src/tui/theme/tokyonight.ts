/**
 * Tokyo Night color palette for Jiratown TUI
 * Based on https://github.com/folke/tokyonight.nvim
 */

// Tokyo Night palette (raw colors)
const tokyonightPalette = {
  // Backgrounds
  bg: "#1a1b26",
  bg_dark: "#16161e",
  bg_highlight: "#292e42",
  bg_visual: "#283457",

  // Foregrounds
  fg: "#c0caf5",
  fg_dark: "#a9b1d6",
  fg_gutter: "#3b4261",

  // Colors
  blue: "#7aa2f7",
  blue0: "#3d59a1",
  blue1: "#2ac3de",
  blue2: "#0db9d7",
  blue5: "#89ddff",
  cyan: "#7dcfff",
  green: "#9ece6a",
  green1: "#73daca",
  green2: "#41a6b5",
  magenta: "#bb9af7",
  magenta2: "#ff007c",
  orange: "#ff9e64",
  purple: "#9d7cd8",
  red: "#f7768e",
  red1: "#db4b4b",
  teal: "#1abc9c",
  yellow: "#e0af68",

  // Terminal colors
  terminal_black: "#414868",

  // UI
  border: "#15161e",
  border_highlight: "#27a1b9",
  comment: "#565f89",
  dark3: "#545c7e",
  dark5: "#737aa2",
} as const;

// Tokyo Night theme mapped to Jiratown color structure
export const tokyonight = {
  // Primary brand colors
  primary: tokyonightPalette.blue,
  primaryBright: tokyonightPalette.blue5,
  primaryDim: tokyonightPalette.blue0,
  secondary: tokyonightPalette.magenta,

  // Background colors
  bg: {
    shell: tokyonightPalette.bg_dark,
    base: tokyonightPalette.bg,
    elevated: tokyonightPalette.bg_dark,
    highlight: tokyonightPalette.bg_highlight,
    input: tokyonightPalette.bg_dark,
  },

  // Text colors
  text: {
    primary: tokyonightPalette.fg,
    secondary: tokyonightPalette.fg_dark,
    dim: tokyonightPalette.comment,
    inverse: tokyonightPalette.bg,
  },

  // Border colors
  border: {
    default: tokyonightPalette.fg_gutter,
    focus: tokyonightPalette.border_highlight,
    dim: tokyonightPalette.terminal_black,
  },

  // Status colors (for ticket states)
  status: {
    pending: tokyonightPalette.comment,
    queued: tokyonightPalette.green2,
    planning: tokyonightPalette.blue,
    implementing: tokyonightPalette.yellow,
    blocked: tokyonightPalette.red,
    pr_created: tokyonightPalette.magenta,
    in_review: tokyonightPalette.orange,
    done: tokyonightPalette.green,
  },

  // Semantic colors
  success: tokyonightPalette.green2,
  successBright: tokyonightPalette.green,
  warning: tokyonightPalette.yellow,
  warningBright: tokyonightPalette.orange,
  error: tokyonightPalette.red1,
  errorBright: tokyonightPalette.red,
  info: tokyonightPalette.blue2,
  infoBright: tokyonightPalette.cyan,

  // Agent colors
  agent: {
    opencode: tokyonightPalette.cyan,
    claude: tokyonightPalette.orange,
  },
} as const;

// Export raw palette for advanced usage
export { tokyonightPalette };
