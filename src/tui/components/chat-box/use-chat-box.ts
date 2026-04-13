/**
 * useChatBox hook - State management for chat input
 *
 * Manages input value, focus state, and message history.
 */

import { createSignal, type Accessor } from "solid-js";

export interface ChatMessage {
  /** Message content */
  content: string;
  /** When the message was sent */
  timestamp: Date;
  /** Message source */
  source: "user" | "agent" | "system";
}

export interface UseChatBoxOptions {
  /** Called when a message is submitted */
  onSubmit?: (message: string) => void;
  /** Initial focused state */
  initialFocused?: boolean;
}

export interface UseChatBoxReturn {
  /** Current input value */
  value: Accessor<string>;
  /** Set input value */
  setValue: (value: string) => void;
  /** Whether input is focused */
  isFocused: Accessor<boolean>;
  /** Set focus state */
  setFocused: (focused: boolean) => void;
  /** Toggle focus state */
  toggleFocus: () => void;
  /** Submit current value */
  submit: () => void;
  /** Clear input */
  clear: () => void;
  /** Message history */
  messages: Accessor<ChatMessage[]>;
  /** Add a message to history */
  addMessage: (content: string, source: ChatMessage["source"]) => void;
}

/**
 * Hook for managing chat box state
 *
 * @example
 * const chat = useChatBox({
 *   onSubmit: (msg) => sendToAgent(msg),
 * });
 *
 * <ChatBox
 *   value={chat.value()}
 *   onChange={chat.setValue}
 *   onSubmit={chat.submit}
 *   focused={chat.isFocused()}
 *   onFocusChange={chat.setFocused}
 * />
 */
export function useChatBox(options: UseChatBoxOptions = {}): UseChatBoxReturn {
  const [value, setValue] = createSignal("");
  const [isFocused, setFocused] = createSignal(options.initialFocused ?? false);
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);

  const addMessage = (content: string, source: ChatMessage["source"]) => {
    const message: ChatMessage = {
      content,
      timestamp: new Date(),
      source,
    };
    setMessages((prev) => [...prev, message]);
  };

  const submit = () => {
    const trimmed = value().trim();
    if (!trimmed) return;

    // Add to history
    addMessage(trimmed, "user");

    // Call handler
    options.onSubmit?.(trimmed);

    // Clear input
    setValue("");
  };

  const clear = () => {
    setValue("");
  };

  const toggleFocus = () => {
    setFocused((prev) => !prev);
  };

  return {
    value,
    setValue,
    isFocused,
    setFocused,
    toggleFocus,
    submit,
    clear,
    messages,
    addMessage,
  };
}
