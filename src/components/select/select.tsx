/**
 * Select component - Radio group selection
 *
 * Provides a styled radio group for selecting from options.
 * Supports keyboard navigation with arrows when in edit mode.
 *
 * @example
 * <Select
 *   value={selectedAgent()}
 *   onChange={setSelectedAgent}
 *   options={[
 *     { value: 'opencode', label: 'OpenCode' },
 *     { value: 'claude', label: 'Claude Code' },
 *   ]}
 *   label="Agent"
 * />
 */

import { For, useContext } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import { useTheme } from "../../lib/theme/index.ts";
import { useInteractive } from "../../hooks/index.ts";
import { CellContext } from "../grid/index.ts";

export interface SelectOption<T = string> {
  /** Option value */
  value: T;
  /** Display label */
  label: string;
  /** Optional description */
  description?: string;
  /** Whether option is disabled */
  disabled?: boolean;
}

export interface SelectProps<T = string> {
  /** Currently selected value */
  value: T;
  /** Called when selection changes */
  onChange: (value: T) => void;
  /** Available options */
  options: SelectOption<T>[];
  /** Label text */
  label?: string;
  /** Whether to display inline (horizontal) */
  inline?: boolean;
  /** Whether the entire select is disabled */
  disabled?: boolean;
  /** Whether the select is focused (explicit override, defaults to grid context) */
  focused?: boolean;
}

/**
 * Radio option item
 */
function SelectItem<T>(props: {
  option: SelectOption<T>;
  isSelected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  const isDisabled = () => props.disabled || props.option.disabled;

  const { isHighlighted, interactiveProps } = useInteractive({
    disabled: isDisabled(),
    onPress: props.onSelect,
  });

  const radioIcon = () => (props.isSelected ? "[*]" : "[ ]");

  const textColor = () => {
    if (isDisabled()) return theme().text.dim;
    if (props.isSelected) return theme().primary;
    if (isHighlighted()) return theme().text.primary;
    return theme().text.secondary;
  };

  return (
    <box
      flexDirection="row"
      alignItems="center"
      marginRight={2}
      marginBottom={1}
      {...interactiveProps}
    >
      <text fg={textColor()}>{radioIcon()} </text>
      <text fg={textColor()}>{props.option.label}</text>
    </box>
  );
}

/**
 * Styled radio group selection
 */
export function Select<T = string>(props: SelectProps<T>) {
  const { theme } = useTheme();
  const cell = useContext(CellContext);

  const inline = () => props.inline ?? false;

  // Determine if focused: explicit prop > grid context > false
  const isFocused = () => {
    if (props.focused !== undefined) return props.focused;
    return cell?.isFocused() ?? false;
  };

  // In edit mode when grid cell is in edit mode
  const isEditMode = () => cell?.isEditMode() ?? false;

  const borderColor = () => {
    if (isEditMode()) return theme().primary;
    if (isFocused()) return theme().border.focus;
    return theme().border.default;
  };

  const handleSelect = (value: T) => {
    if (!props.disabled) {
      props.onChange(value);
    }
  };

  // Navigate to next/previous option
  const navigate = (direction: "next" | "prev") => {
    if (props.disabled) return;

    const enabledOptions = props.options.filter((opt) => !opt.disabled);

    if (enabledOptions.length === 0) return;

    // Find current position in enabled options
    const currentEnabledIndex = enabledOptions.findIndex((opt) => opt.value === props.value);

    let nextIndex: number;
    if (direction === "next") {
      nextIndex = (currentEnabledIndex + 1) % enabledOptions.length;
    } else {
      nextIndex = currentEnabledIndex <= 0 ? enabledOptions.length - 1 : currentEnabledIndex - 1;
    }

    props.onChange(enabledOptions[nextIndex].value);
  };

  // Handle keyboard navigation when in edit mode
  useKeyboard((key) => {
    if (!isEditMode() || props.disabled) return;

    // For inline (horizontal) layout, use left/right
    // For vertical layout, use up/down
    if (inline()) {
      if (key.name === "left") {
        navigate("prev");
      } else if (key.name === "right") {
        navigate("next");
      }
    } else {
      if (key.name === "up") {
        navigate("prev");
      } else if (key.name === "down") {
        navigate("next");
      }
    }
  });

  return (
    <box
      flexDirection="column"
      border={isFocused() || isEditMode()}
      borderColor={borderColor()}
      borderStyle={isEditMode() ? "double" : "single"}
    >
      {/* Label */}
      {props.label && (
        <text fg={theme().text.secondary} marginBottom={1}>
          {props.label}
          {isEditMode() ? " (editing)" : ""}
        </text>
      )}

      {/* Options */}
      <box flexDirection={inline() ? "row" : "column"}>
        <For each={props.options}>
          {(option) => (
            <SelectItem
              option={option}
              isSelected={props.value === option.value}
              onSelect={() => handleSelect(option.value)}
              disabled={props.disabled}
            />
          )}
        </For>
      </box>
    </box>
  );
}
