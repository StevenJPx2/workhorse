/**
 * TUI color theme constants.
 * Uses ANSI color names compatible with terminal rendering.
 */
export const theme = {
  colors: {
    /** Main background */
    background: "black",
    /** Primary text color */
    text: "white",
    /** Dimmed/secondary text */
    dim: "gray",
    /** Info/highlight color */
    info: "cyan",
    /** Success color */
    success: "green",
    /** Warning color (blocked status) */
    warning: "yellow",
    /** Error color (CI failed, changes requested) */
    error: "red",
    /** Selection highlight background */
    selection: "blue",
    /** Border color */
    border: "gray",
  },
  /** Status indicators */
  status: {
    running: { icon: "●", color: "green" },
    blocked: { icon: "⚠", color: "yellow" },
    idle: { icon: "○", color: "gray" },
    stopped: { icon: "■", color: "red" },
  },
} as const;

export type Theme = typeof theme;
