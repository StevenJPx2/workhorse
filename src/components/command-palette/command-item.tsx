/**
 * CommandItem component - Individual command row in the palette
 *
 * Displays a command with label, shortcut hint, and selection state.
 * Handles both regular commands and submenu items.
 */

import { Show } from "solid-js";
import { useInteractive } from "../../hooks/use-interactive/index.ts";
import { useTheme } from "../../lib/theme/index.ts";
import type { Command, SubmenuItem } from "./types.ts";
import { isSubmenuCommand } from "./types.ts";

export interface CommandItemProps {
  /** Command or submenu item to display */
  item: Command | SubmenuItem;
  /** Whether this item is currently selected */
  isSelected: boolean;
  /** Called when item is clicked */
  onSelect: () => void;
  /** Index for display (optional, for j/k hints) */
  index?: number;
}

/**
 * Single command row in the command palette
 */
export function CommandItem(props: CommandItemProps) {
  const { theme } = useTheme();
  const { isHighlighted, interactiveProps } = useInteractive({
    onPress: props.onSelect,
  });

  const bgColor = () => {
    if (props.isSelected) return theme().bg.highlight;
    if (isHighlighted()) return theme().bg.elevated;
    return undefined;
  };

  const textColor = () => {
    if (props.isSelected) return theme().text.primary;
    return theme().text.secondary;
  };

  // Check if item is a Command (has 'type' property)
  const isCommand = () => "type" in props.item;
  const command = () => (isCommand() ? (props.item as Command) : null);
  const hasSubmenu = () => {
    const cmd = command();
    return cmd ? isSubmenuCommand(cmd) : false;
  };

  // Get shortcut from Command
  const shortcut = () => {
    const cmd = command();
    return cmd?.shortcut;
  };

  // Check if submenu item is active
  const isActive = () => {
    if (!isCommand()) {
      const submenuItem = props.item as SubmenuItem;
      return submenuItem.isActive?.() === true;
    }
    return false;
  };

  return (
    <box
      height={1}
      backgroundColor={bgColor()}
      flexDirection="row"
      paddingLeft={1}
      paddingRight={1}
      {...interactiveProps}
    >
      {/* Selection indicator */}
      <text fg={props.isSelected ? theme().primary : theme().text.dim}>
        {props.isSelected ? ">" : " "}
      </text>
      <text> </text>

      {/* Active indicator for submenu items */}
      <Show when={isActive()}>
        <text fg={theme().success}>*</text>
        <text> </text>
      </Show>

      {/* Label */}
      <text fg={textColor()}>{props.item.label}</text>

      {/* Spacer */}
      <box flexGrow={1} />

      {/* Shortcut hint */}
      <Show when={shortcut()}>
        <text fg={theme().text.dim}>[{shortcut()}]</text>
      </Show>

      {/* Submenu indicator */}
      <Show when={hasSubmenu()}>
        <text fg={theme().text.dim}> ›</text>
      </Show>
    </box>
  );
}
