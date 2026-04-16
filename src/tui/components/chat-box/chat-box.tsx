/**
 * ChatBox component - Input field for sending messages to agent
 *
 * Wraps TextInput with a prompt prefix and submit hint.
 * Used at the bottom of ticket pane for user feedback.
 *
 * @example
 * <ChatBox
 *   inputId="chat-box"
 *   value={message()}
 *   setValue={setMessage}
 *   submit={handleSubmit}
 *   placeholder="Type a message to the agent..."
 * />
 */

import { Show, createSignal } from "solid-js";
import { useKeyboardContext } from "../../contexts/keyboard-context.ts";
import { useTheme } from "../../theme/index.ts";
import { TextInput } from "../text-input/index.ts";

export interface ChatBoxProps {
  /** Unique ID for this input (used by keyboard context) */
  inputId: string;
  /** Current input value */
  value: string;
  /** Called when input changes */
  setValue: (value: string) => void;
  /** Called when user submits (Enter in single-line, Ctrl/Cmd+Enter in multiline) */
  submit: () => void;
  /** Called when user exits input mode (Escape) */
  exit?: () => void;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Enable multiline mode - text wraps, Enter adds newline, Ctrl/Cmd+Enter submits */
  multiline?: boolean;
  /** Maximum visible width for overflow calculation (characters). Single-line only.
   * When text exceeds this width, shows end of text with "…" prefix. */
  maxVisibleWidth?: number;
}

/**
 * Chat input box with prompt prefix
 */
export function ChatBox(props: ChatBoxProps) {
  const { theme } = useTheme();
  const keyboard = useKeyboardContext();
  const [isHovered, setIsHovered] = createSignal(false);

  const placeholder = () => props.placeholder ?? "Type a message...";
  const isDisabled = () => props.disabled ?? false;
  const isFocused = () => keyboard.hasInputFocus(props.inputId);
  const isMultiline = () => props.multiline ?? false;

  const handleSubmit = () => {
    if (props.value.trim()) {
      props.submit();
    }
  };

  const handleExit = () => {
    props.setValue("");
    props.exit?.();
  };

  // Use highlight color on hover, otherwise use input background
  const bgColor = () => (isHovered() || isFocused() ? theme().bg.highlight : theme().bg.input);

  return (
    <box
      height={3}
      backgroundColor={bgColor()}
      flexDirection="row"
      alignItems="center"
      paddingLeft={1}
      paddingRight={1}
      onMouseOver={() => setIsHovered(true)}
      onMouseOut={() => setIsHovered(false)}
    >
      {/* Prompt prefix */}
      <text fg={theme().primary}>&gt; </text>

      {/* Input area - uses TextInput without border */}
      <box flexGrow={1}>
        <TextInput
          inputId={props.inputId}
          value={props.value}
          onChange={props.setValue}
          onSubmit={handleSubmit}
          onExit={handleExit}
          placeholder={placeholder()}
          disabled={isDisabled()}
          border={false}
          multiline={isMultiline()}
          maxVisibleWidth={props.maxVisibleWidth}
          backgroundColor={bgColor()}
        />
      </box>

      {/* Submit hint - shows different shortcut for multiline */}
      <Show when={props.value && isFocused()}>
        <text fg={theme().text.dim}>{isMultiline() ? "[⌘↵]" : "[Enter]"}</text>
      </Show>
    </box>
  );
}
