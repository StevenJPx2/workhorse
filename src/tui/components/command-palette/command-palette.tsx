/**
 * CommandPalette component - Vim-style command launcher
 *
 * A modal overlay triggered by `:` that provides fuzzy search
 * across available commands with keyboard navigation.
 *
 * @example
 * <CommandPalette
 *   isOpen={paletteOpen()}
 *   commands={commands}
 *   palette={paletteState}
 * />
 */

import { useKeyboard } from "@opentui/solid";
import { createMemo, For, Show } from "solid-js";
import type { UseCommandPaletteReturn } from "../../hooks/use-command-palette/index.ts";
import { useKeyboardContext } from "../../contexts/keyboard-context.ts";
import { useTheme } from "../../theme/index.ts";
import { Modal } from "../modal/index.ts";
import { CommandItem } from "./command-item.tsx";

/** Maximum number of visible items in the palette */
const MAX_VISIBLE = 8;

export interface CommandPaletteProps {
  /** Command palette state from useCommandPalette hook */
  palette: UseCommandPaletteReturn;
}

/**
 * Command palette modal with fuzzy search
 */
export function CommandPalette(props: CommandPaletteProps) {
  const { theme } = useTheme();
  const keyboard = useKeyboardContext();
  const p = () => props.palette;

  // Handle keyboard input
  useKeyboard((key) => {
    if (!p().isOpen()) return;

    // Don't process if another input has focus
    if (keyboard.isInputMode()) return;

    // Navigation
    if (key.name === "j" || key.name === "down") {
      p().selectNext();
      return;
    }
    if (key.name === "k" || key.name === "up") {
      p().selectPrevious();
      return;
    }

    // Execute selected
    if (key.name === "return" || key.name === "enter") {
      p().executeSelected();
      return;
    }

    // Go back / close
    if (key.name === "escape") {
      p().goBack();
      return;
    }

    // Backspace
    if (key.name === "backspace") {
      p().backspace();
      return;
    }

    // Type characters into query (only printable chars, exclude trigger keys)
    if (key.name && key.name.length === 1 && !key.ctrl && !key.meta) {
      // Don't append the trigger key (: or ;) that opened the palette
      if (key.name === ":" || key.name === ";") return;
      p().appendToQuery(key.name);
    }
  });

  const title = () => {
    const submenu = p().currentSubmenu();
    if (submenu) {
      return submenu.label;
    }
    return "Commands";
  };

  const hint = () => {
    if (p().isInSubmenu()) {
      return "↑↓ navigate • Enter select • Esc back";
    }
    return "Type to filter • ↑↓ navigate • Enter select • Esc close";
  };

  // Calculate visible items with scrolling window
  const visibleItems = createMemo(() => {
    const items = p().displayItems();
    const selected = p().selectedIndex();
    const total = items.length;

    if (total <= MAX_VISIBLE) {
      return items.map((item, index) => ({ item, index }));
    }

    // Calculate window start to keep selected item visible
    let start = 0;
    if (selected >= MAX_VISIBLE - 1) {
      start = Math.min(selected - MAX_VISIBLE + 2, total - MAX_VISIBLE);
    }

    return items.slice(start, start + MAX_VISIBLE).map((item, i) => ({ item, index: start + i }));
  });

  // Calculate modal height based on content

  return (
    <Modal
      isOpen={p().isOpen()}
      onClose={() => p().close()}
      lockId="command-palette"
      width={50}
      closeOnEscape={false}
    >
      {/* Header */}
      <box flexDirection="row">
        <text fg={theme().primary}>
          <strong>{title()}</strong>
        </text>
        <Show when={p().isInSubmenu()}>
          <text fg={theme().text.dim}> (submenu)</text>
        </Show>
      </box>

      {/* Search input - only show in main list */}
      <Show when={!p().isInSubmenu()}>
        <box height={1} />
        <box
          height={1}
          backgroundColor={theme().bg.input}
          paddingLeft={1}
          paddingRight={1}
          flexDirection="row"
        >
          <text fg={theme().text.dim}>:</text>
          <text fg={theme().text.primary}>{p().query()}</text>
          <text fg={theme().primary}>_</text>
        </box>
      </Show>

      {/* Command list */}
      <box height={1} />
      <box flexGrow={1} flexDirection="column">
        <Show
          when={p().displayItems().length > 0}
          fallback={<text fg={theme().text.dim}>No matching commands</text>}
        >
          <For each={visibleItems()}>
            {(item) => (
              <CommandItem
                item={item.item}
                isSelected={item.index === p().selectedIndex()}
                onSelect={() => {
                  // Select this item and execute
                  while (p().selectedIndex() < item.index) p().selectNext();
                  while (p().selectedIndex() > item.index) p().selectPrevious();
                  p().executeSelected();
                }}
                index={item.index}
              />
            )}
          </For>
          <Show when={p().displayItems().length > MAX_VISIBLE}>
            <text fg={theme().text.dim}>... {p().displayItems().length - MAX_VISIBLE} more</text>
          </Show>
        </Show>
      </box>

      {/* Footer hint */}
      <box height={1} />
      <text fg={theme().text.dim}>{hint()}</text>
    </Modal>
  );
}
