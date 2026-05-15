/**
 * Global keybindings for the Workhorse TUI.
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
    // Ctrl+X enters command mode
    if (key.ctrl && key.name === "x") {
      setCommandMode(true);
      return;
    }

    // If in command mode, handle the command key
    if (commandMode()) {
      setCommandMode(false); // Reset command mode

      switch (key.name) {
        case "q":
          // Gracefully shutdown (stop agents, cleanup) before destroying renderer
          ui.shutdown().finally(() => renderer.destroy());
          return;
        case "h":
        case "?":
          ui.setScreen("help");
          return;
        case "m":
          ui.openModelModal();
          return;
      }
      // Unknown command key - just ignore
      return;
    }

    // Tab for focus switching (but not when a modal is open)
    if (key.name === "tab" && !ui.modal()) {
      if (key.shift) {
        ui.focusPrev();
      } else {
        ui.focusNext();
      }
      return;
    }

    // ESC always works (even in input mode)
    if (key.name === "escape") {
      if (ui.modal()) {
        ui.closeModal();
      } else if (ui.inputMode()) {
        // Exit input mode first, return to navigation
        ui.exitInputMode();
        ui.setFocusedComponent("issues");
        // Reset chat context so the input box goes back to normal mode
        ui.resetChatContext();
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
