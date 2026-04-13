/**
 * Gruvbox color palette for Jiratown TUI
 * Based on https://github.com/morhetz/gruvbox
 */

// Gruvbox dark palette (raw colors)
const gruvboxPalette = {
  // Dark backgrounds
  dark0_hard: "#1d2021",
  dark0: "#282828",
  dark0_soft: "#32302f",
  dark1: "#3c3836",
  dark2: "#504945",
  dark3: "#665c54",
  dark4: "#7c6f64",

  // Light foregrounds
  light0_hard: "#f9f5d7",
  light0: "#fbf1c7",
  light0_soft: "#f2e5bc",
  light1: "#ebdbb2",
  light2: "#d5c4a1",
  light3: "#bdae93",
  light4: "#a89984",

  // Gray
  gray: "#928374",

  // Bright colors (for dark background)
  bright_red: "#fb4934",
  bright_green: "#b8bb26",
  bright_yellow: "#fabd2f",
  bright_blue: "#83a598",
  bright_purple: "#d3869b",
  bright_aqua: "#8ec07c",
  bright_orange: "#fe8019",

  // Neutral colors
  neutral_red: "#cc241d",
  neutral_green: "#98971a",
  neutral_yellow: "#d79921",
  neutral_blue: "#458588",
  neutral_purple: "#b16286",
  neutral_aqua: "#689d6a",
  neutral_orange: "#d65d0e",

  // Faded colors (for light background)
  faded_red: "#9d0006",
  faded_green: "#79740e",
  faded_yellow: "#b57614",
  faded_blue: "#076678",
  faded_purple: "#8f3f71",
  faded_aqua: "#427b58",
  faded_orange: "#af3a03",
} as const;

// Gruvbox theme mapped to Jiratown color structure
export const gruvbox = {
  // Primary brand colors
  primary: gruvboxPalette.bright_aqua,
  primaryBright: gruvboxPalette.light0,
  primaryDim: gruvboxPalette.neutral_aqua,
  secondary: gruvboxPalette.bright_purple,

  // Background colors
  bg: {
    shell: gruvboxPalette.dark0_hard,
    base: gruvboxPalette.dark0,
    elevated: gruvboxPalette.dark1,
    highlight: gruvboxPalette.dark2,
    input: gruvboxPalette.dark0_soft,
  },

  // Text colors
  text: {
    primary: gruvboxPalette.light1,
    secondary: gruvboxPalette.light4,
    dim: gruvboxPalette.gray,
    inverse: gruvboxPalette.dark0,
  },

  // Border colors
  border: {
    default: gruvboxPalette.dark3,
    focus: gruvboxPalette.bright_aqua,
    dim: gruvboxPalette.dark2,
  },

  // Status colors (for ticket states)
  status: {
    pending: gruvboxPalette.gray,
    queued: gruvboxPalette.neutral_green,
    planning: gruvboxPalette.bright_blue,
    implementing: gruvboxPalette.bright_yellow,
    blocked: gruvboxPalette.bright_red,
    pr_created: gruvboxPalette.bright_purple,
    in_review: gruvboxPalette.bright_orange,
    done: gruvboxPalette.bright_green,
  },

  // Semantic colors
  success: gruvboxPalette.neutral_green,
  successBright: gruvboxPalette.bright_green,
  warning: gruvboxPalette.neutral_yellow,
  warningBright: gruvboxPalette.bright_yellow,
  error: gruvboxPalette.neutral_red,
  errorBright: gruvboxPalette.bright_red,
  info: gruvboxPalette.neutral_blue,
  infoBright: gruvboxPalette.bright_blue,

  // Agent colors
  agent: {
    opencode: gruvboxPalette.bright_aqua,
    claude: gruvboxPalette.bright_orange,
  },
} as const;

// Export raw palette for advanced usage
export { gruvboxPalette };
