/**
 * useSelection hook - List selection state management
 *
 * Provides standardized single-selection state for lists with
 * navigation methods for keyboard control.
 */

import { createSignal, type Accessor } from "solid-js";

/**
 * Options for configuring the selection hook
 */
export interface UseSelectionOptions<T> {
  /** Array of items to select from */
  items: Accessor<T[]>;
  /** Initial selected index (-1 for no selection) */
  initialIndex?: number;
  /** Whether selection wraps around at boundaries */
  wrap?: boolean;
  /** Callback when selection changes */
  onSelect?: (index: number, item: T | undefined) => void;
  /** Get unique key for item (defaults to index) */
  getKey?: (item: T, index: number) => string | number;
}

/**
 * Return value from useSelection hook
 */
export interface UseSelectionReturn<T> {
  /** Currently selected index (-1 if none) */
  selectedIndex: Accessor<number>;
  /** Currently selected item (undefined if none) */
  selectedItem: Accessor<T | undefined>;
  /** Whether the given index is selected */
  isSelected: (index: number) => boolean;
  /** Select item by index */
  select: (index: number) => void;
  /** Select item by key */
  selectByKey: (key: string | number) => void;
  /** Move selection to next item */
  selectNext: () => void;
  /** Move selection to previous item */
  selectPrev: () => void;
  /** Select first item */
  selectFirst: () => void;
  /** Select last item */
  selectLast: () => void;
  /** Clear selection */
  clear: () => void;
}

/**
 * Hook for managing list selection state
 *
 * Provides navigation methods for keyboard control (j/k, arrows, etc.)
 *
 * @example
 * ```tsx
 * function TicketList() {
 *   const tickets = () => [...];
 *   const {
 *     selectedIndex,
 *     selectedItem,
 *     isSelected,
 *     selectNext,
 *     selectPrev,
 *   } = useSelection({
 *     items: tickets,
 *     wrap: true,
 *     onSelect: (idx, ticket) => console.log('Selected:', ticket?.id),
 *   });
 *
 *   useKeyboard((key) => {
 *     if (key.name === 'j' || key.name === 'down') selectNext();
 *     if (key.name === 'k' || key.name === 'up') selectPrev();
 *   });
 *
 *   return (
 *     <For each={tickets()}>
 *       {(ticket, index) => (
 *         <TicketItem
 *           ticket={ticket}
 *           isSelected={isSelected(index())}
 *         />
 *       )}
 *     </For>
 *   );
 * }
 * ```
 */
export function useSelection<T>(
  options: UseSelectionOptions<T>
): UseSelectionReturn<T> {
  const [selectedIndex, setSelectedIndex] = createSignal(
    options.initialIndex ?? -1
  );

  const wrap = () => options.wrap ?? false;
  const getKey = options.getKey ?? ((_item: T, index: number) => index);

  // Using a function instead of createMemo for better SSR/test compatibility
  const selectedItem: Accessor<T | undefined> = () => {
    const idx = selectedIndex();
    const list = options.items();
    if (idx < 0 || idx >= list.length) return undefined;
    return list[idx];
  };

  const isSelected = (index: number): boolean => {
    const currentIndex = selectedIndex();
    // -1 means no selection, so nothing should be "selected"
    if (currentIndex === -1) return false;
    return currentIndex === index;
  };

  const select = (index: number): void => {
    const items = options.items();
    const maxIndex = items.length - 1;

    // Clamp to valid range
    let newIndex = index;
    if (index < 0) {
      newIndex = wrap() ? maxIndex : -1;
    } else if (index > maxIndex) {
      newIndex = wrap() ? 0 : maxIndex;
    }

    // Only update if changed
    if (newIndex !== selectedIndex()) {
      setSelectedIndex(newIndex);
      const item = newIndex >= 0 ? items[newIndex] : undefined;
      options.onSelect?.(newIndex, item);
    }
  };

  const selectByKey = (key: string | number): void => {
    const items = options.items();
    const index = items.findIndex((item, idx) => getKey(item, idx) === key);
    if (index !== -1) {
      select(index);
    }
  };

  const selectNext = (): void => {
    const items = options.items();
    if (items.length === 0) return;

    const current = selectedIndex();
    if (current === -1) {
      // No selection, select first
      select(0);
    } else {
      select(current + 1);
    }
  };

  const selectPrev = (): void => {
    const items = options.items();
    if (items.length === 0) return;

    const current = selectedIndex();
    if (current === -1) {
      // No selection, select last
      select(items.length - 1);
    } else {
      select(current - 1);
    }
  };

  const selectFirst = (): void => {
    const items = options.items();
    if (items.length > 0) {
      select(0);
    }
  };

  const selectLast = (): void => {
    const items = options.items();
    if (items.length > 0) {
      select(items.length - 1);
    }
  };

  const clear = (): void => {
    if (selectedIndex() !== -1) {
      setSelectedIndex(-1);
      options.onSelect?.(-1, undefined);
    }
  };

  return {
    selectedIndex,
    selectedItem,
    isSelected,
    select,
    selectByKey,
    selectNext,
    selectPrev,
    selectFirst,
    selectLast,
    clear,
  };
}
