/**
 * useKeyboardInput hook - Handles keyboard input for text fields
 *
 * Extracted from TextInput to keep component files under line limits.
 * Manages character input, special keys, and paste handling.
 */

import { useKeyboard, usePaste } from "@opentui/solid";
import { readClipboardSync } from "#core/clipboard.ts";

interface KeyboardInputOptions {
  /** Current input value */
  getValue: () => string;
  /** Value change handler */
  onChange: (value: string) => void;
  /** Submit handler */
  onSubmit?: (value: string) => void;
  /** Exit handler */
  onExit?: () => void;
  /** Whether input is disabled */
  isDisabled: () => boolean;
  /** Whether input is focused */
  isFocused: () => boolean;
  /** Whether input is in edit mode */
  isEditMode: () => boolean;
  /** Whether input is multiline */
  isMultiline: () => boolean;
  /** Reset cursor blink timer */
  resetCursorBlink: () => void;
  /** Exit input mode callback */
  exitInputMode: () => void;
  /** Enter edit mode for grid context */
  enterGridEditMode?: () => void;
}

/**
 * Hook to manage keyboard input handling for text fields
 */
export function useKeyboardInput(options: KeyboardInputOptions): void {
  const {
    getValue,
    onChange,
    onSubmit,
    onExit,
    isDisabled,
    isFocused,
    isEditMode,
    isMultiline,
    resetCursorBlink,
    exitInputMode,
    enterGridEditMode,
  } = options;

  // Handle keyboard input
  useKeyboard((key) => {
    if (isDisabled()) return;

    // Paste handling (Ctrl+V or Cmd+V)
    const isPaste = (key.name === "v" && (key.ctrl || key.meta)) || key.sequence === "\x16";
    if (isPaste && (isFocused() || isEditMode())) {
      const clipboardText = readClipboardSync();
      if (clipboardText) {
        onChange(getValue() + clipboardText);
        enterGridEditMode?.();
        resetCursorBlink();
      }
      return;
    }

    if (!isEditMode()) return;
    resetCursorBlink();

    // Enter key - submit or newline depending on mode
    if (key.name === "return" || key.name === "enter") {
      if (isMultiline()) {
        if (key.ctrl || key.meta) onSubmit?.(getValue());
        else onChange(getValue() + "\n");
      } else {
        onSubmit?.(getValue());
      }
      return;
    }

    if (key.name === "escape") {
      exitInputMode();
      onExit?.();
      return;
    }

    if (key.name === "backspace") {
      onChange(getValue().slice(0, -1));
      return;
    }

    if (key.name === "space") {
      onChange(getValue() + " ");
      return;
    }

    if (key.name && key.name.length === 1 && !key.ctrl && !key.meta) {
      onChange(getValue() + key.name);
    }
  });

  // Handle bracketed paste from terminal
  usePaste((event) => {
    if (isDisabled() || (!isFocused() && !isEditMode())) return;
    const text = new TextDecoder().decode(event.bytes);
    if (text) {
      onChange(getValue() + text);
      enterGridEditMode?.();
      resetCursorBlink();
    }
  });
}
