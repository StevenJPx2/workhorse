/**
 * Keymap configuration for Jiratown TUI.
 *
 * Uses @opentui/keymap for layered, focus-aware keybindings.
 * Global bindings are registered at the app level.
 * Screen-specific bindings are registered in each screen component.
 */

import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";

/**
 * Command names for the application.
 * Using constants prevents typos and enables autocomplete.
 */
export const Commands = {
  // Global
  QUIT: "quit",
  SHOW_HELP: "show-help",
  CLOSE_MODAL: "close-modal",

  // Navigation
  FOCUS_NEXT: "focus-next",
  FOCUS_PREV: "focus-prev",
  NAVIGATE_UP: "navigate-up",
  NAVIGATE_DOWN: "navigate-down",
  SELECT: "select",
  BACK: "back",
} as const;

/**
 * Create the application keymap.
 * This should be called once when the app starts.
 *
 * @param renderer - The OpenTUI CLI renderer instance
 */
export function createAppKeymap(renderer: Parameters<typeof createDefaultOpenTuiKeymap>[0]) {
  return createDefaultOpenTuiKeymap(renderer);
}

export type AppKeymap = ReturnType<typeof createAppKeymap>;
