/**
 * TextInput component - Basic text input field
 *
 * Provides a styled text input with keyboard handling,
 * placeholder support, and focus management.
 *
 * @example
 * <TextInput
 *   inputId="ticket-key"
 *   value={ticketKey()}
 *   onChange={setTicketKey}
 *   placeholder="Enter ticket key (e.g., AM-123)"
 *   label="Ticket"
 * />
 */

import { Show, useContext } from "solid-js";
import { useKeyboard, usePaste } from "@opentui/solid";
import { useTheme } from "../../lib/theme/index.ts";
import { useKeyboardContext } from "../../lib/keyboard-context.ts";
import { CellContext, GridContext } from "../grid/index.ts";
import { readClipboardSync } from "../../lib/clipboard.ts";

export interface TextInputProps {
  /** Unique ID for this input (used by keyboard context) */
  inputId: string;
  /** Current input value */
  value: string;
  /** Called when input changes */
  onChange: (value: string) => void;
  /** Called when user submits (Enter) */
  onSubmit?: (value: string) => void;
  /** Called when user exits input mode (Escape) */
  onExit?: () => void;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Label text above input */
  label?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Input width */
  width?: number | `${number}%` | "auto";
  /** Show border */
  border?: boolean;
  /** Whether the input is focused (from grid context, overrides internal check) */
  focused?: boolean;
}

/**
 * Styled text input field with keyboard handling
 */
export function TextInput(props: TextInputProps) {
  const { theme } = useTheme();
  const keyboard = useKeyboardContext();
  const cell = useContext(CellContext);
  const grid = useContext(GridContext);

  const placeholder = () => props.placeholder ?? "";
  const isDisabled = () => props.disabled ?? false;
  const showBorder = () => props.border ?? true;

  // Determine focus state: explicit prop > grid context > keyboard context
  const isFocused = () => {
    if (props.focused !== undefined) return props.focused;
    if (cell) return cell.isFocused();
    return keyboard.hasInputFocus(props.inputId);
  };

  // In edit mode when: in a grid cell with edit mode, or keyboard input mode
  const isEditMode = () => {
    if (cell) return cell.isEditMode();
    return keyboard.hasInputFocus(props.inputId);
  };

  // Handle keyboard input when in edit mode
  useKeyboard((key) => {
    if (isDisabled()) return;

    // Paste from clipboard (Ctrl+V or Cmd+V) - works when focused OR in edit mode
    // In standard terminal mode, Ctrl+V sends \x16; in kitty protocol, name="v" + ctrl=true
    const isPaste = (key.name === "v" && (key.ctrl || key.meta)) || key.sequence === "\x16";
    if (isPaste && (isFocused() || isEditMode())) {
      const clipboardText = readClipboardSync();
      if (clipboardText) {
        props.onChange(props.value + clipboardText);
        // Enter edit mode if we weren't already (for Grid context)
        if (cell && grid && !isEditMode()) {
          grid.enterEditMode(cell.cellId);
        }
      }
      return;
    }

    // Rest of keyboard handling requires edit mode
    if (!isEditMode()) return;

    // Submit on Enter
    if (key.name === "return" || key.name === "enter") {
      props.onSubmit?.(props.value);
      return;
    }

    // Clear on Escape and exit input mode
    if (key.name === "escape") {
      keyboard.exitInputMode();
      props.onExit?.();
      return;
    }

    // Backspace
    if (key.name === "backspace") {
      props.onChange(props.value.slice(0, -1));
      return;
    }

    // Type printable characters
    if (key.name && key.name.length === 1 && !key.ctrl && !key.meta) {
      props.onChange(props.value + key.name);
    }
  });

  // Handle bracketed paste from terminal (Cmd+V / right-click paste)
  // Real terminals send pasted text wrapped in escape sequences, not as Ctrl+V key events
  usePaste((event) => {
    if (isDisabled()) return;
    if (!isFocused() && !isEditMode()) return;

    const text = new TextDecoder().decode(event.bytes);
    if (text) {
      props.onChange(props.value + text);
      if (cell && grid && !isEditMode()) {
        grid.enterEditMode(cell.cellId);
      }
    }
  });

  const borderColor = () => {
    if (isDisabled()) return theme().border.dim;
    if (isFocused()) return theme().border.focus;
    return theme().border.default;
  };

  const handleClick = () => {
    if (!isDisabled()) {
      keyboard.enterInputMode(props.inputId);
    }
  };

  return (
    <box flexDirection="column" width={props.width} onMouseDown={handleClick}>
      {/* Label */}
      <Show when={props.label}>
        <text fg={theme().text.secondary} marginBottom={1}>
          {props.label}
        </text>
      </Show>

      {/* Input box */}
      <box
        height={showBorder() ? 3 : 1}
        border={showBorder()}
        borderStyle="rounded"
        borderColor={borderColor()}
        backgroundColor={theme().bg.input}
        flexDirection="row"
        alignItems="center"
        paddingLeft={showBorder() ? 1 : 0}
        paddingRight={showBorder() ? 1 : 0}
      >
        {/* Input content */}
        <box flexGrow={1} flexDirection="row">
          <Show when={props.value} fallback={<text fg={theme().text.dim}>{placeholder()}</text>}>
            <text fg={theme().text.primary}>{props.value}</text>
          </Show>

          {/* Cursor when in edit mode */}
          <Show when={isEditMode() && !isDisabled()}>
            <text fg={theme().primary}>_</text>
          </Show>
        </box>
      </box>
    </box>
  );
}
