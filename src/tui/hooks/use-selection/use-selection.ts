import { createSignal, type Accessor } from "solid-js";
import { type UseSelectionOptions, type UseSelectionReturn } from "./types.ts";
export type { UseSelectionOptions, UseSelectionReturn } from "./types.ts";

export function useSelection<T>(options: UseSelectionOptions<T>): UseSelectionReturn<T> {
  const [selectedIndex, setSelectedIndex] = createSignal(options.initialIndex ?? -1);

  const wrap = () => options.wrap ?? false;
  const getKey = options.getKey ?? ((_item: T, index: number) => index);

  const selectedItem: Accessor<T | undefined> = () => {
    const idx = selectedIndex();
    const list = options.items();
    if (idx < 0 || idx >= list.length) return undefined;
    return list[idx];
  };

  const isSelected = (index: number): boolean => {
    const currentIndex = selectedIndex();
    if (currentIndex === -1) return false;
    return currentIndex === index;
  };

  const select = (index: number): void => {
    const items = options.items();
    const maxIndex = items.length - 1;

    let newIndex = index;
    if (index < 0) {
      newIndex = wrap() ? maxIndex : -1;
    } else if (index > maxIndex) {
      newIndex = wrap() ? 0 : maxIndex;
    }

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
