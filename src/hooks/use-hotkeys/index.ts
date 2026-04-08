/**
 * useHotkeys hook exports
 */

// Types
export {
  type HotkeyCombo,
  type HotkeyHandler,
  type Hotkey,
  type HotkeyContext,
  type UseHotkeysOptions,
  type UseHotkeysReturn,
  type KeyInfo,
  type HotkeyManager,
} from "./types.ts";

// Utility functions
export { parseCombo, matchesCombo } from "./combo-utils.ts";

// Main hook
export { useHotkeys } from "./use-hotkeys.ts";

// Manager
export { createHotkeyManager } from "./hotkey-manager.ts";
