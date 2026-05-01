/**
 * TUI color themes.
 *
 * Supports both hex colors (for true-color terminals) and ANSI color names as fallback.
 * Themes based on:
 * - Gruvbox: https://github.com/morhetz/gruvbox
 * - Tokyo Night: https://github.com/folke/tokyonight.nvim
 */

// ─── Theme Types ─────────────────────────────────────────────────────────────

export interface ThemeColors {
  /** Main background */
  background: string;
  /** Primary text color */
  text: string;
  /** Dimmed/secondary text */
  dim: string;
  /** Info/highlight color */
  info: string;
  /** Success color */
  success: string;
  /** Warning color (blocked status) */
  warning: string;
  /** Error color (CI failed, changes requested) */
  error: string;
  /** Selection highlight background */
  selection: string;
  /** Border color */
  border: string;
  /** Accent color for interactive elements */
  accent: string;
  /** Muted background for cards/modals */
  surface: string;
}

export interface StatusIndicator {
  icon: string;
  color: string;
}

export interface Theme {
  name: string;
  colors: ThemeColors;
  status: {
    running: StatusIndicator;
    blocked: StatusIndicator;
    idle: StatusIndicator;
    stopped: StatusIndicator;
  };
}

// ─── Gruvbox Theme ───────────────────────────────────────────────────────────
// https://github.com/morhetz/gruvbox

export const gruvbox: Theme = {
  name: "gruvbox",
  colors: {
    // Dark mode colors
    background: "#282828", // dark0
    text: "#ebdbb2", // light1
    dim: "#928374", // gray
    info: "#83a598", // bright_blue
    success: "#b8bb26", // bright_green
    warning: "#fabd2f", // bright_yellow
    error: "#fb4934", // bright_red
    selection: "#504945", // dark2
    border: "#665c54", // dark3
    accent: "#fe8019", // bright_orange
    surface: "#3c3836", // dark1
  },
  status: {
    running: { icon: "●", color: "#b8bb26" }, // bright_green
    blocked: { icon: "⚠", color: "#fabd2f" }, // bright_yellow
    idle: { icon: "○", color: "#928374" }, // gray
    stopped: { icon: "■", color: "#fb4934" }, // bright_red
  },
};

// ─── Tokyo Night Theme ───────────────────────────────────────────────────────
// https://github.com/folke/tokyonight.nvim (night variant)

export const tokyonight: Theme = {
  name: "tokyonight",
  colors: {
    background: "#1a1b26", // bg
    text: "#c0caf5", // fg
    dim: "#565f89", // comment
    info: "#7dcfff", // cyan
    success: "#9ece6a", // green
    warning: "#e0af68", // yellow
    error: "#f7768e", // red
    selection: "#283457", // bg_visual
    border: "#27a1b9", // border_highlight
    accent: "#7aa2f7", // blue
    surface: "#16161e", // bg_dark
  },
  status: {
    running: { icon: "●", color: "#9ece6a" }, // green
    blocked: { icon: "⚠", color: "#e0af68" }, // yellow
    idle: { icon: "○", color: "#565f89" }, // comment
    stopped: { icon: "■", color: "#f7768e" }, // red
  },
};

// ─── Theme Registry ──────────────────────────────────────────────────────────

export const themes = {
  gruvbox,
  tokyonight,
} as const;

export type ThemeName = keyof typeof themes;

// ─── Active Theme ────────────────────────────────────────────────────────────

/**
 * Currently active theme.
 * Set via `setTheme()` based on config.
 */
let activeTheme: Theme = tokyonight;

/**
 * Get the currently active theme.
 */
export function getTheme(): Theme {
  return activeTheme;
}

/**
 * Set the active theme by name.
 * Falls back to tokyonight if theme name is not found.
 */
export function setTheme(name: string): void {
  activeTheme = themes[name as ThemeName] ?? tokyonight;
}

/**
 * Legacy export for backwards compatibility.
 * Components should migrate to using `getTheme()` for dynamic theming.
 *
 * @deprecated Use `getTheme()` instead for dynamic theme support.
 */
export const theme = tokyonight;
