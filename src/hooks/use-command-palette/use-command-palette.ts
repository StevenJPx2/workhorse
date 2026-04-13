/**
 * useCommandPalette hook - Command palette state management
 *
 * Manages open/close state, selection navigation, query filtering,
 * and submenu navigation for the command palette.
 *
 * Note: Navigation locking is handled by the Modal component,
 * not by this hook.
 */

import { createSignal, createMemo, type Accessor } from "solid-js";
import { useCommandFilter } from "../use-command-filter/index.ts";
import type {
  Command,
  SubmenuItem,
  SubmenuCommand,
} from "../../components/command-palette/types.ts";
import { isSubmenuCommand } from "../../components/command-palette/types.ts";

export interface UseCommandPaletteOptions {
  /** Available commands */
  commands: Command[];
  /** Called when a command action is executed */
  onExecute?: (command: Command | SubmenuItem) => void;
  /** Called when palette closes */
  onClose?: () => void;
}

export interface UseCommandPaletteReturn {
  /** Whether palette is open */
  isOpen: Accessor<boolean>;
  /** Open the palette */
  open: () => void;
  /** Close the palette */
  close: () => void;
  /** Toggle the palette */
  toggle: () => void;
  /** Current search query */
  query: Accessor<string>;
  /** Set search query */
  setQuery: (q: string) => void;
  /** Append character to query */
  appendToQuery: (char: string) => void;
  /** Delete last character from query */
  backspace: () => void;
  /** Currently selected index */
  selectedIndex: Accessor<number>;
  /** Move selection up */
  selectPrevious: () => void;
  /** Move selection down */
  selectNext: () => void;
  /** Reset selection to first item */
  resetSelection: () => void;
  /** Items to display (commands or submenu items) */
  displayItems: Accessor<Array<Command | SubmenuItem>>;
  /** Whether currently viewing a submenu */
  isInSubmenu: Accessor<boolean>;
  /** Current submenu (if in submenu) */
  currentSubmenu: Accessor<SubmenuCommand | null>;
  /** Enter submenu or execute action */
  executeSelected: () => void;
  /** Go back from submenu to main list */
  goBack: () => void;
}

/**
 * Hook for managing command palette state
 */
export function useCommandPalette(options: UseCommandPaletteOptions): UseCommandPaletteReturn {
  const [isOpen, setIsOpen] = createSignal(false);
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [currentSubmenu, setCurrentSubmenu] = createSignal<SubmenuCommand | null>(null);

  // Filter commands using fuzzy search
  const { query, setQuery, clearQuery, filteredItems } = useCommandFilter({
    items: options.commands,
    getText: (cmd) => cmd.label,
  });

  // Items to display - either filtered commands or submenu items
  const displayItems = createMemo((): Array<Command | SubmenuItem> => {
    const submenu = currentSubmenu();
    if (submenu) {
      return submenu.items;
    }
    return filteredItems();
  });

  const isInSubmenu = createMemo(() => currentSubmenu() !== null);

  const open = () => {
    setIsOpen(true);
    setSelectedIndex(0);
    clearQuery();
    setCurrentSubmenu(null);
  };

  const close = () => {
    setIsOpen(false);
    setSelectedIndex(0);
    clearQuery();
    setCurrentSubmenu(null);
    options.onClose?.();
  };

  const toggle = () => {
    if (isOpen()) {
      close();
    } else {
      open();
    }
  };

  const selectPrevious = () => {
    const items = displayItems();
    if (items.length === 0) return;
    setSelectedIndex((i) => (i > 0 ? i - 1 : items.length - 1));
  };

  const selectNext = () => {
    const items = displayItems();
    if (items.length === 0) return;
    setSelectedIndex((i) => (i < items.length - 1 ? i + 1 : 0));
  };

  const resetSelection = () => setSelectedIndex(0);

  const appendToQuery = (char: string) => {
    // Only allow query changes in main list, not submenu
    if (currentSubmenu()) return;
    setQuery(query() + char);
    resetSelection();
  };

  const backspace = () => {
    const q = query();
    if (q.length > 0) {
      setQuery(q.slice(0, -1));
      resetSelection();
    }
  };

  const executeSelected = () => {
    const items = displayItems();
    const selected = items[selectedIndex()];
    if (!selected) return;

    // Check if it's a Command with submenu
    if ("type" in selected && isSubmenuCommand(selected)) {
      setCurrentSubmenu(selected);
      setSelectedIndex(0);
      return;
    }

    // Execute action
    if ("action" in selected) {
      selected.action();
      options.onExecute?.(selected);
      close();
    }
  };

  const goBack = () => {
    if (currentSubmenu()) {
      setCurrentSubmenu(null);
      setSelectedIndex(0);
    } else {
      close();
    }
  };

  return {
    isOpen,
    open,
    close,
    toggle,
    query,
    setQuery,
    appendToQuery,
    backspace,
    selectedIndex,
    selectPrevious,
    selectNext,
    resetSelection,
    displayItems,
    isInSubmenu,
    currentSubmenu,
    executeSelected,
    goBack,
  };
}
