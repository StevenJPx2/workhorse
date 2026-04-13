import type { Accessor } from "solid-js";

export interface UseSelectionOptions<T> {
  items: Accessor<T[]>;
  initialIndex?: number;
  wrap?: boolean;
  onSelect?: (index: number, item: T | undefined) => void;
  getKey?: (item: T, index: number) => string | number;
}

export interface UseSelectionReturn<T> {
  selectedIndex: Accessor<number>;
  selectedItem: Accessor<T | undefined>;
  isSelected: (index: number) => boolean;
  select: (index: number) => void;
  selectByKey: (key: string | number) => void;
  selectNext: () => void;
  selectPrev: () => void;
  selectFirst: () => void;
  selectLast: () => void;
  clear: () => void;
}
