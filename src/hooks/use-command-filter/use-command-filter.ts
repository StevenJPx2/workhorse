/**
 * useCommandFilter hook - Reactive fuzzy filtering for commands
 *
 * Provides a reactive interface for filtering command lists
 * using fuzzy search with Solid.js signals.
 */

import { createSignal, createMemo, type Accessor } from "solid-js";
import { fuzzyFilter } from "./fuzzy-match.ts";

export interface UseCommandFilterOptions<T> {
  /** Items to filter */
  items: T[] | Accessor<T[]>;
  /** Function to extract searchable text from item */
  getText: (item: T) => string;
  /** Initial query value */
  initialQuery?: string;
}

export interface UseCommandFilterReturn<T> {
  /** Current search query */
  query: Accessor<string>;
  /** Set the search query */
  setQuery: (query: string) => void;
  /** Clear the search query */
  clearQuery: () => void;
  /** Filtered items based on current query */
  filteredItems: Accessor<T[]>;
}

/**
 * Hook for fuzzy filtering a list of items
 *
 * @example
 * ```tsx
 * const { query, setQuery, filteredItems } = useCommandFilter({
 *   items: commands,
 *   getText: (cmd) => cmd.label,
 * });
 *
 * // In render:
 * <For each={filteredItems()}>
 *   {(cmd) => <CommandItem command={cmd} />}
 * </For>
 * ```
 */
export function useCommandFilter<T>(
  options: UseCommandFilterOptions<T>,
): UseCommandFilterReturn<T> {
  const [query, setQuery] = createSignal(options.initialQuery ?? "");

  const getItems = () => {
    const items = options.items;
    return typeof items === "function" ? items() : items;
  };

  const filteredItems = createMemo(() => {
    const currentQuery = query();
    const items = getItems();
    return fuzzyFilter(currentQuery, items, options.getText);
  });

  const clearQuery = () => setQuery("");

  return {
    query,
    setQuery,
    clearQuery,
    filteredItems,
  };
}
