/**
 * Hook for managing cursor blink state
 */

import { createSignal, createEffect, onCleanup, type Accessor } from "solid-js";

/** Cursor blink interval in ms */
const CURSOR_BLINK_INTERVAL = 530;

interface UseCursorBlinkOptions {
  /** Whether the input is in edit mode (cursor should blink) */
  isEditMode: Accessor<boolean>;
  /** Whether the input is disabled */
  isDisabled: Accessor<boolean>;
}

interface UseCursorBlinkReturn {
  /** Whether the cursor is currently visible */
  cursorVisible: Accessor<boolean>;
  /** Reset cursor to visible and restart blink timer (call on keystroke) */
  resetCursorBlink: () => void;
}

/**
 * Manages cursor blinking - blinks when idle, stays visible while typing
 */
export function useCursorBlink(options: UseCursorBlinkOptions): UseCursorBlinkReturn {
  const { isEditMode, isDisabled } = options;

  const [cursorVisible, setCursorVisible] = createSignal(true);
  let blinkTimer: ReturnType<typeof setInterval> | null = null;

  // Reset cursor to visible and restart blink timer
  const resetCursorBlink = () => {
    setCursorVisible(true);
    if (blinkTimer) {
      clearInterval(blinkTimer);
    }
    blinkTimer = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, CURSOR_BLINK_INTERVAL);
  };

  // Start/stop blinking based on edit mode
  createEffect(() => {
    if (isEditMode() && !isDisabled()) {
      resetCursorBlink();
    } else {
      if (blinkTimer) {
        clearInterval(blinkTimer);
        blinkTimer = null;
      }
      setCursorVisible(true);
    }
  });

  // Cleanup on unmount
  onCleanup(() => {
    if (blinkTimer) {
      clearInterval(blinkTimer);
      blinkTimer = null;
    }
  });

  return { cursorVisible, resetCursorBlink };
}
