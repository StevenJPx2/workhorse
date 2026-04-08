/**
 * Utility functions for parsing and matching key combinations
 */

import type { HotkeyCombo, KeyInfo } from "./types.ts";

/**
 * Parse a key combo string into a KeyInfo object
 *
 * @example
 * parseCombo("ctrl+s") // { name: "s", ctrl: true }
 * parseCombo("j") // { name: "j" }
 */
export function parseCombo(combo: HotkeyCombo): KeyInfo {
  const parts = combo.toLowerCase().split("+");
  const result: KeyInfo = { name: parts[parts.length - 1] };

  for (let i = 0; i < parts.length - 1; i++) {
    const mod = parts[i];
    if (mod === "ctrl" || mod === "control") result.ctrl = true;
    if (mod === "cmd" || mod === "meta") result.meta = true;
    if (mod === "shift") result.shift = true;
    if (mod === "alt" || mod === "option") result.alt = true;
  }

  return result;
}

/**
 * Check if a key event matches a combo
 */
export function matchesCombo(key: KeyInfo, combo: HotkeyCombo): boolean {
  const parsed = parseCombo(combo);

  // Check key name
  if (key.name.toLowerCase() !== parsed.name) return false;

  // Check modifiers
  if ((parsed.ctrl ?? false) !== (key.ctrl ?? false)) return false;
  if ((parsed.meta ?? false) !== (key.meta ?? false)) return false;
  if ((parsed.shift ?? false) !== (key.shift ?? false)) return false;
  if ((parsed.alt ?? false) !== (key.alt ?? false)) return false;

  return true;
}
