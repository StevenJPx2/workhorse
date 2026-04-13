/**
 * useHotkeys hook - Context-aware keyboard shortcut management
 *
 * Provides a way to register keyboard shortcuts that can be
 * enabled/disabled based on context (e.g., different shortcuts
 * when a modal is open vs. when it's closed).
 */

import { createSignal } from "solid-js";
import type {
  HotkeyCombo,
  HotkeyHandler,
  Hotkey,
  UseHotkeysOptions,
  UseHotkeysReturn,
  KeyInfo,
} from "./types.ts";
import { matchesCombo } from "./combo-utils.ts";

/**
 * Hook for registering context-aware keyboard shortcuts
 *
 * @example
 * ```tsx
 * function Sidebar() {
 *   const { register, isEnabled, enable, disable } = useHotkeys({
 *     context: 'sidebar',
 *     initialEnabled: true,
 *   });
 *
 *   // Register hotkeys
 *   register('j', () => selectNext(), 'Select next item');
 *   register('k', () => selectPrev(), 'Select previous item');
 *   register('enter', () => openTicket(), 'Open selected ticket');
 *
 *   // Disable when modal opens
 *   const modal = useModal({
 *     onOpen: () => disable(),
 *     onClose: () => enable(),
 *   });
 * }
 * ```
 */
export function useHotkeys(options: UseHotkeysOptions): UseHotkeysReturn {
  const [isEnabled, setIsEnabled] = createSignal(options.initialEnabled ?? true);
  const hotkeys = new Map<HotkeyCombo, Hotkey>();

  const enable = (): void => {
    setIsEnabled(true);
  };

  const disable = (): void => {
    setIsEnabled(false);
  };

  const register = (
    combo: HotkeyCombo,
    handler: HotkeyHandler,
    description?: string,
  ): (() => void) => {
    const normalizedCombo = combo.toLowerCase();
    hotkeys.set(normalizedCombo, {
      combo: normalizedCombo,
      handler,
      description,
      enabled: true,
    });

    // Return unregister function
    return () => {
      hotkeys.delete(normalizedCombo);
    };
  };

  const getHotkeys = (): Hotkey[] => {
    return Array.from(hotkeys.values());
  };

  const handleKey = (key: KeyInfo): boolean => {
    if (!isEnabled()) return false;

    for (const [combo, hotkey] of hotkeys) {
      if (hotkey.enabled && matchesCombo(key, combo)) {
        hotkey.handler();
        return true;
      }
    }

    return false;
  };

  return {
    context: options.context,
    isEnabled,
    enable,
    disable,
    register,
    getHotkeys,
    handleKey,
  };
}
