/**
 * Type definitions for the hotkeys system
 */

import type { Accessor } from "solid-js";

/**
 * Key combination string format:
 * - Single key: "j", "k", "enter", "escape"
 * - With modifiers: "ctrl+s", "cmd+k", "shift+enter"
 */
export type HotkeyCombo = string;

/**
 * Hotkey handler function
 */
export type HotkeyHandler = () => void;

/**
 * A registered hotkey
 */
export interface Hotkey {
  /** Key combination */
  combo: HotkeyCombo;
  /** Handler function */
  handler: HotkeyHandler;
  /** Description for help menu */
  description?: string;
  /** Whether the hotkey is currently enabled */
  enabled: boolean;
}

/**
 * Context for grouping hotkeys
 */
export type HotkeyContext = string;

/**
 * Options for the hotkeys hook
 */
export interface UseHotkeysOptions {
  /** Context identifier for this group of hotkeys */
  context: HotkeyContext;
  /** Whether this context's hotkeys are initially enabled */
  initialEnabled?: boolean;
}

/**
 * Key information from keyboard event
 */
export interface KeyInfo {
  name: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

/**
 * Return value from useHotkeys hook
 */
export interface UseHotkeysReturn {
  /** Context identifier */
  context: HotkeyContext;
  /** Whether this context's hotkeys are enabled */
  isEnabled: Accessor<boolean>;
  /** Enable all hotkeys in this context */
  enable: () => void;
  /** Disable all hotkeys in this context */
  disable: () => void;
  /** Register a hotkey */
  register: (
    combo: HotkeyCombo,
    handler: HotkeyHandler,
    description?: string
  ) => () => void;
  /** Get all registered hotkeys in this context */
  getHotkeys: () => Hotkey[];
  /** Handle a key event, returns true if handled */
  handleKey: (key: KeyInfo) => boolean;
}

/**
 * Create a global hotkey manager for coordinating multiple contexts
 */
export interface HotkeyManager {
  /** Register a hotkey context */
  registerContext: (context: HotkeyContext) => UseHotkeysReturn;
  /** Enable a specific context */
  enableContext: (context: HotkeyContext) => void;
  /** Disable a specific context */
  disableContext: (context: HotkeyContext) => void;
  /** Enable only the specified context (disable all others) */
  focusContext: (context: HotkeyContext) => void;
  /** Get all registered hotkeys across all contexts */
  getAllHotkeys: () => Array<{ context: HotkeyContext; hotkeys: Hotkey[] }>;
  /** Handle a key event across all enabled contexts */
  handleKey: (key: KeyInfo) => boolean;
}
