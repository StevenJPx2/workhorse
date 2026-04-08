/**
 * Keyboard context - Global keyboard event management
 *
 * Provides a way to track which keys have been "consumed" by handlers,
 * preventing the same key from triggering multiple actions.
 *
 * Also tracks "input mode" - when active, regular shortcuts are suppressed
 * and keys are routed to the focused input.
 *
 * @example
 * // In a component that handles 'i' to enter input mode
 * const keyboard = useKeyboardContext();
 *
 * useKeyboard((key) => {
 *   if (key.name === 'i' && !keyboard.isInputMode()) {
 *     keyboard.enterInputMode('chat-box');
 *     return; // Don't let 'i' propagate to the input
 *   }
 * });
 */

import {
  createContext,
  useContext,
  createSignal,
  type Accessor,
} from "solid-js";

/**
 * Keyboard context value
 */
export interface KeyboardContextValue {
  /** Whether currently in input mode (text input has focus) */
  isInputMode: Accessor<boolean>;
  /** The ID of the current input (if in input mode) */
  currentInputId: Accessor<string | null>;
  /** Enter input mode with the given input ID */
  enterInputMode: (inputId: string) => void;
  /** Exit input mode */
  exitInputMode: () => void;
  /** Check if a specific input has focus */
  hasInputFocus: (inputId: string) => boolean;
}

export const KeyboardContext = createContext<KeyboardContextValue>();

/**
 * Create keyboard context value (used by provider)
 */
export function createKeyboardValue(): KeyboardContextValue {
  const [currentInputId, setCurrentInputId] = createSignal<string | null>(null);

  const isInputMode: Accessor<boolean> = () => currentInputId() !== null;

  const enterInputMode = (inputId: string) => {
    setCurrentInputId(inputId);
  };

  const exitInputMode = () => {
    setCurrentInputId(null);
  };

  const hasInputFocus = (inputId: string): boolean => {
    return currentInputId() === inputId;
  };

  return {
    isInputMode,
    currentInputId,
    enterInputMode,
    exitInputMode,
    hasInputFocus,
  };
}

/**
 * Hook to access keyboard context
 *
 * @example
 * const keyboard = useKeyboardContext();
 *
 * // Check if in input mode before handling shortcuts
 * if (keyboard.isInputMode()) return;
 *
 * // Enter input mode
 * keyboard.enterInputMode('my-input');
 */
export function useKeyboardContext(): KeyboardContextValue {
  const context = useContext(KeyboardContext);
  if (!context) {
    // Return a no-op default if not in provider
    return {
      isInputMode: () => false,
      currentInputId: () => null,
      enterInputMode: () => {},
      exitInputMode: () => {},
      hasInputFocus: () => false,
    };
  }
  return context;
}
