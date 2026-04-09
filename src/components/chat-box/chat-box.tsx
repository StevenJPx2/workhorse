/**
 * ChatBox component - Input field for sending messages to agent
 *
 * Provides a text input with prompt prefix and submit hint.
 * Used at the bottom of ticket pane for user feedback.
 *
 * Uses keyboard context to manage input mode - when focused,
 * the context tracks that we're in input mode so other components
 * don't process the same keystrokes.
 *
 * @example
 * <ChatBox
 *   inputId="chat-box"
 *   value={message()}
 *   onChange={setMessage}
 *   onSubmit={handleSubmit}
 *   placeholder="Type a message to the agent..."
 * />
 */

import { useKeyboard } from "@opentui/solid";
import { Show } from "solid-js";
import { readClipboardSync } from "../../lib/clipboard.ts";
import { useKeyboardContext } from "../../lib/keyboard-context.ts";
import { useTheme } from "../../lib/theme/index.ts";

export interface ChatBoxProps {
  /** Unique ID for this input (used by keyboard context) */
  inputId: string;
  /** Current input value */
  value: string;
  /** Called when input changes */
  onChange: (value: string) => void;
  /** Called when user submits (Enter) */
  onSubmit: (value: string) => void;
  /** Called when user exits input mode (Escape) */
  onExit?: () => void;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
}

/**
 * Chat input box with prompt prefix
 */
export function ChatBox(props: ChatBoxProps) {
  const { theme } = useTheme();
  const keyboard = useKeyboardContext();

  const placeholder = () => props.placeholder ?? "Type a message...";
  const isDisabled = () => props.disabled ?? false;
  const isFocused = () => keyboard.hasInputFocus(props.inputId);

  // Handle keyboard input when focused
  useKeyboard((key) => {
    if (!isFocused() || isDisabled()) return;

    // Submit on Enter
    if (key.name === "return" || key.name === "enter") {
      if (props.value.trim()) {
        props.onSubmit(props.value.trim());
      }
      return;
    }

    // Clear on Escape and exit input mode
    if (key.name === "escape") {
      props.onChange("");
      keyboard.exitInputMode();
      props.onExit?.();
      return;
    }

    // Backspace
    if (key.name === "backspace") {
      props.onChange(props.value.slice(0, -1));
      return;
    }

    // Paste from clipboard (Ctrl+V or Cmd+V)
    if (key.name === "v" && (key.ctrl || key.meta)) {
      const clipboardText = readClipboardSync();
      if (clipboardText) {
        props.onChange(props.value + clipboardText);
      }
      return;
    }

    // Space key (key.name is "space", not " ")
    if (key.name === "space") {
      props.onChange(props.value + " ");
      return;
    }

    // Type printable characters (single character names, excluding modifiers)
    if (key.name && key.name.length === 1 && !key.ctrl && !key.meta) {
      props.onChange(props.value + key.name);
    }
  });

  return (
    <box
      height={3}
      backgroundColor={theme().bg.input}
      flexDirection="row"
      alignItems="center"
      paddingLeft={1}
      paddingRight={1}
    >
      {/* Prompt prefix */}
      <text fg={theme().primary}>&gt; </text>

      {/* Input area */}
      <box flexGrow={1} flexDirection="row">
        <Show
          when={props.value}
          fallback={<text fg={theme().text.dim}>{placeholder()}</text>}
        >
          <text fg={theme().text.primary}>{props.value}</text>
        </Show>

        {/* Cursor when focused */}
        <Show when={isFocused() && !isDisabled()}>
          <text fg={theme().primary}>_</text>
        </Show>
      </box>

      {/* Submit hint */}
      <Show when={props.value && isFocused()}>
        <text fg={theme().text.dim}>[Enter]</text>
      </Show>
    </box>
  );
}
