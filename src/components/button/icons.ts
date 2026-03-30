/**
 * Common icon constants for Jiratown TUI buttons
 *
 * These are Unicode characters that render well in terminal environments.
 */

export const icons = {
  // Actions
  add: "+",
  remove: "-",
  close: "x",
  check: "✓",

  // Navigation
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",

  // Media/Control
  play: "▶",
  pause: "⏸",
  stop: "■",
  refresh: "⟳",

  // Status
  info: "i",
  warning: "!",
  error: "x",
  help: "?",

  // Misc
  edit: "e",
  save: "s",
  search: "/",
  settings: "*",
} as const;

export type IconName = keyof typeof icons;
