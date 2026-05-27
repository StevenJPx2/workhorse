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
 */
export function focusNext() {
  const next =
    FOCUS_ORDER[
      (FOCUS_ORDER.indexOf(focusedComponent()) + 1) % FOCUS_ORDER.length
    ]!;

  setFocusedComponent(next);
  // Auto-toggle input mode based on what we're focusing
  setInputMode(next === "chat");
}

/**
 * Focus the previous component in tab order.
 * Automatically enters input mode when focusing chat.
 */
export function focusPrev() {
  const prev =
    FOCUS_ORDER[
      (FOCUS_ORDER.indexOf(focusedComponent()) - 1 + FOCUS_ORDER.length) %
        FOCUS_ORDER.length
    ]!;

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

export { inputMode, setInputMode, focusedComponent, setFocusedComponent };
