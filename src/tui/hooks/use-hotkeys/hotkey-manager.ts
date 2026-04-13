/**
 * Hotkey manager for coordinating multiple contexts
 */

import type { HotkeyContext, HotkeyManager, Hotkey, KeyInfo, UseHotkeysReturn } from "./types.ts";
import { useHotkeys } from "./use-hotkeys.ts";

/**
 * Create a hotkey manager
 *
 * @example
 * ```tsx
 * const manager = createHotkeyManager();
 *
 * // In sidebar component
 * const sidebar = manager.registerContext('sidebar');
 * sidebar.register('j', () => selectNext());
 *
 * // In modal component
 * const modal = manager.registerContext('modal');
 * modal.register('escape', () => close());
 *
 * // Focus modal when opened (disables sidebar hotkeys)
 * manager.focusContext('modal');
 * ```
 */
export function createHotkeyManager(): HotkeyManager {
  const contexts = new Map<HotkeyContext, UseHotkeysReturn>();

  const registerContext = (context: HotkeyContext): UseHotkeysReturn => {
    const existing = contexts.get(context);
    if (existing) return existing;

    const hotkeys = useHotkeys({ context, initialEnabled: true });
    contexts.set(context, hotkeys);
    return hotkeys;
  };

  const enableContext = (context: HotkeyContext): void => {
    contexts.get(context)?.enable();
  };

  const disableContext = (context: HotkeyContext): void => {
    contexts.get(context)?.disable();
  };

  const focusContext = (context: HotkeyContext): void => {
    for (const [ctx, hotkeys] of contexts) {
      if (ctx === context) {
        hotkeys.enable();
      } else {
        hotkeys.disable();
      }
    }
  };

  const getAllHotkeys = (): Array<{
    context: HotkeyContext;
    hotkeys: Hotkey[];
  }> => {
    return Array.from(contexts.entries()).map(([context, hotkeys]) => ({
      context,
      hotkeys: hotkeys.getHotkeys(),
    }));
  };

  const handleKey = (key: KeyInfo): boolean => {
    for (const hotkeys of contexts.values()) {
      if (hotkeys.handleKey(key)) {
        return true;
      }
    }
    return false;
  };

  return {
    registerContext,
    enableContext,
    disableContext,
    focusContext,
    getAllHotkeys,
    handleKey,
  };
}
