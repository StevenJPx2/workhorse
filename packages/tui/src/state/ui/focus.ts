/**
 * Focus management for TUI navigation.
 */

import { createSignal } from "solid-js";

/**
 * Focus targets for tab navigation.
 * Each represents a focusable region in the UI.
 */
export type FocusTarget = "issues" | "agents" | "chat";

// Focus order for tab navigation
const FOCUS_ORDER: FocusTarget[] = ["issues", "agents", "chat"];

// Input mode state
const [inputMode, setInputMode] = createSignal(false);

// Currently focused component
const [focusedComponent, setFocusedComponent] =
  createSignal<FocusTarget>("issues");

// Track which list (issues or agents) was last focused before entering chat
// This determines whether chat input creates a new issue or messages an agent
const [lastFocusedList, setLastFocusedList] = createSignal<"issues" | "agents">(
  "issues",
);

/**
 * Enter input mode (blocks global shortcuts).
 */
export function enterInputMode() {
  setInputMode(true);
}

/**
 * Exit input mode (re-enables global shortcuts).
 */
export function exitInputMode() {
  setInputMode(false);
}

/**
 * Focus the next component in tab order.
 * Automatically enters input mode when focusing chat.
 * Tracks which list was last focused before entering chat.
 */
export function focusNext() {
  const current = focusedComponent();
  const next =
    FOCUS_ORDER[(FOCUS_ORDER.indexOf(current) + 1) % FOCUS_ORDER.length]!;

  // Track the list we're leaving if moving to chat
  if (next === "chat" && (current === "issues" || current === "agents")) {
    setLastFocusedList(current);
  }

  setFocusedComponent(next);
  // Auto-toggle input mode based on what we're focusing
  setInputMode(next === "chat");
}

/**
 * Focus the previous component in tab order.
 * Automatically enters input mode when focusing chat.
 * Tracks which list was last focused before entering chat.
 */
export function focusPrev() {
  const current = focusedComponent();
  const prev =
    FOCUS_ORDER[
      (FOCUS_ORDER.indexOf(current) - 1 + FOCUS_ORDER.length) %
        FOCUS_ORDER.length
    ]!;

  // Track the list we're leaving if moving to chat
  if (prev === "chat" && (current === "issues" || current === "agents")) {
    setLastFocusedList(current);
  }

  setFocusedComponent(prev);
  // Auto-toggle input mode based on what we're focusing
  setInputMode(prev === "chat");
}

/**
 * Check if a component is currently focused.
 */
export function isFocused(target: FocusTarget) {
  return focusedComponent() === target;
}

/**
 * Reset the chat context to default (issues mode).
 * Called when user presses Escape to clear agent chat context.
 */
export function resetChatContext() {
  setLastFocusedList("issues");
}

export {
  inputMode,
  setInputMode,
  focusedComponent,
  setFocusedComponent,
  lastFocusedList,
  setLastFocusedList,
};
