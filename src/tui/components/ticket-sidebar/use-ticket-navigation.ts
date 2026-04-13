/**
 * useTicketNavigation hook - Keyboard navigation for ticket sidebar
 */

import { useKeyboard } from "@opentui/solid";
import { useKeyboardContext } from "../../contexts/keyboard-context.ts";

export interface UseTicketNavigationOptions {
  /** Total number of tickets */
  ticketCount: () => number;
  /** Currently selected index */
  selectedIndex: () => number;
  /** Callback to update selected index */
  onSelect: (index: number) => void;
  /** Callback when new ticket is requested */
  onNew: () => void;
  /** Whether navigation is disabled (e.g., when modal is open) */
  disabled?: () => boolean;
}

export interface KeyInfo {
  name: string;
}

export interface NavigationContext {
  isInputMode: () => boolean;
}

/**
 * Pure handler function for keyboard navigation logic.
 * Exported for testing.
 */
export function handleNavigationKey(
  key: KeyInfo,
  options: UseTicketNavigationOptions,
  context: NavigationContext,
): void {
  // Skip if in input mode (e.g., chat box focused)
  if (context.isInputMode()) return;

  // Skip if navigation is disabled (e.g., modal open)
  if (options.disabled?.()) return;

  const count = options.ticketCount();
  if (count === 0) {
    // Only allow new ticket when no tickets exist
    if (key.name === "n" || key.name === "+") {
      options.onNew();
    }
    return;
  }

  const current = options.selectedIndex();

  // Navigate down: j or down arrow
  if (key.name === "j" || key.name === "down") {
    const next = current < count - 1 ? current + 1 : 0;
    options.onSelect(next);
    return;
  }

  // Navigate up: k or up arrow
  if (key.name === "k" || key.name === "up") {
    const prev = current > 0 ? current - 1 : count - 1;
    options.onSelect(prev);
    return;
  }

  // Quick jump: 1-9
  const num = parseInt(key.name, 10);
  if (num >= 1 && num <= 9 && num <= count) {
    options.onSelect(num - 1);
    return;
  }

  // New ticket: n or +
  if (key.name === "n" || key.name === "+") {
    options.onNew();
  }
}

/**
 * Hook that provides keyboard navigation for the ticket sidebar
 *
 * Supports:
 * - j/k or arrow keys for up/down navigation
 * - 1-9 for quick jump to specific ticket
 * - n/+ for new ticket
 *
 * @example
 * useTicketNavigation({
 *   ticketCount: () => tickets().length,
 *   selectedIndex,
 *   onSelect: setSelectedIndex,
 *   onNew: () => openNewTicketModal(),
 * });
 */
export function useTicketNavigation(options: UseTicketNavigationOptions): void {
  const keyboard = useKeyboardContext();

  useKeyboard((key) => {
    handleNavigationKey(key, options, keyboard);
  });
}
