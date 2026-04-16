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
import { useTheme } from "../../theme/index.ts";
import { useKeyboardContext } from "../../contexts/keyboard-context.ts";
import { CellContext, GridContext } from "../grid/index.ts";
import { useCursorBlink } from "./use-cursor-blink.ts";
import { useKeyboardInput } from "./use-keyboard-input.ts";
import type { TextInputProps } from "./types.ts";

export type { TextInputProps } from "./types.ts";

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
  const isMultiline = () => props.multiline ?? false;

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

  // Cursor blink management
  const { cursorVisible, resetCursorBlink } = useCursorBlink({ isEditMode, isDisabled });

  // Keyboard input handling (extracted to separate hook)
  useKeyboardInput({
    getValue: () => props.value,
    onChange: props.onChange,
    onSubmit: props.onSubmit,
    onExit: props.onExit,
    isDisabled,
    isFocused,
    isEditMode,
    isMultiline,
    resetCursorBlink,
    exitInputMode: () => keyboard.exitInputMode(),
    enterGridEditMode:
      cell && grid && !isEditMode() ? () => grid.enterEditMode(cell.cellId) : undefined,
  });

  // Calculate the visible portion of text for overflow handling (single-line only)
  const getVisibleText = () => {
    const text = props.value;
    if (!text || isMultiline()) return text;

    let availableWidth = props.maxVisibleWidth;
    if (availableWidth === undefined && typeof props.width === "number") {
      const borderPadding = showBorder() ? 4 : 0;
      availableWidth = props.width - borderPadding;
    }

    if (!availableWidth || text.length <= availableWidth) return text;

    const visibleLength = availableWidth - 2; // -1 for cursor, -1 for ellipsis
    if (visibleLength <= 0) return text.slice(-1);

    return "…" + text.slice(-visibleLength);
  };

  const borderColor = () => {
    if (isDisabled()) return theme().border.dim;
    if (isFocused()) return theme().border.focus;
    return theme().border.default;
  };

  const handleClick = () => {
    if (!isDisabled()) keyboard.enterInputMode(props.inputId);
  };

  const getInputHeight = () => {
    if (isMultiline()) {
      if (props.height !== undefined) return showBorder() ? props.height + 2 : props.height;
      return undefined;
    }
    return showBorder() ? 3 : 1;
  };

  return (
    <box flexDirection="column" width={props.width} onMouseDown={handleClick}>
      <Show when={props.label}>
        <text fg={theme().text.secondary} marginBottom={1}>
          {props.label}
        </text>
      </Show>

      {/* Input content - text and cursor */}
      {(() => {
        const textBg = showBorder() ? undefined : props.backgroundColor;
        const content = (
          <box flexGrow={1} flexDirection="row" flexWrap={isMultiline() ? "wrap" : "no-wrap"}>
            <Show
              when={props.value}
              fallback={
                <text fg={theme().text.dim} bg={textBg}>
                  {placeholder()}
                </text>
              }
            >
              <text fg={theme().text.primary} bg={textBg}>
                {getVisibleText()}
              </text>
            </Show>
            <Show when={isEditMode() && !isDisabled() && cursorVisible()}>
              <text fg={theme().primary} bg={textBg}>
                █
              </text>
            </Show>
          </box>
        );

        // Only set background when bordered - borderless inputs inherit from parent
        return showBorder() ? (
          <box
            height={getInputHeight()}
            backgroundColor={theme().bg.input}
            flexDirection={isMultiline() ? "column" : "row"}
            alignItems={isMultiline() ? "flex-start" : "center"}
            border
            borderStyle="rounded"
            borderColor={borderColor()}
            paddingLeft={1}
            paddingRight={1}
          >
            {content}
          </box>
        ) : (
          <box
            height={getInputHeight()}
            flexDirection={isMultiline() ? "column" : "row"}
            alignItems={isMultiline() ? "flex-start" : "center"}
          >
            {content}
          </box>
        );
      })()}
    </box>
  );
}
