/**
 * Global keybindings for the Jiratown TUI.
 *
 * Uses Ctrl+X as command prefix to avoid conflicts with text input.
 * Example: Ctrl+X then Q to quit, Ctrl+X then H for help.
 *
 * Tab and ESC work directly (not in command mode).
 */
import { createSignal } from "solid-js";
import { useKeyboard, useRenderer } from "@opentui/solid";
import { ui } from "../state/ui.ts";

// Command mode state - true after Ctrl+X is pressed, waiting for next key
const [commandMode, setCommandMode] = createSignal(false);

/**
 * Setup global keybindings for the app.
 * Call this once in the root App component.
 */
export function useGlobalBindings() {
  const renderer = useRenderer();

  useKeyboard((key) => {
    const keyName = key.name;
    const isCtrl = key.ctrl;

    // Ctrl+X enters command mode
    if (isCtrl && keyName === "x") {
      setCommandMode(true);
      return;
    }

    // If in command mode, handle the command key
    if (commandMode()) {
      setCommandMode(false); // Reset command mode

      switch (keyName) {
        case "q":
          renderer.destroy();
          return;
        case "h":
        case "?":
          ui.setScreen("help");
          return;
      }
      // Unknown command key - just ignore
      return;
    }

    // Tab always works for focus switching (not in command mode)
    if (keyName === "tab") {
      if (key.shift) {
        ui.focusPrev();
      } else {
        ui.focusNext();
      }
      return;
    }

    // ESC always works (even in input mode)
    if (keyName === "escape") {
      if (ui.modal()) {
        ui.closeModal();
      } else if (ui.screen() !== "overview") {
        ui.backToOverview();
      }
      return;
    }
  });
}

/**
 * Check if command mode is active (for UI display).
 */
export function isCommandMode() {
  return commandMode();
}
