import { createSignal, For, type Accessor } from "solid-js";
import { theme } from "../theme.ts";
import type { ChatMessage } from "../primitives/create-chat.ts";

interface ChatBoxProps {
  messages: Accessor<ChatMessage[]>;
  onSend: (message: string) => void;
  placeholder?: string;
}

/**
 * Chat component with scrollable message history and input field.
 */
export function ChatBox(props: ChatBoxProps) {
  const [input, setInput] = createSignal("");

  const handleSubmit = () => {
    const msg = input().trim();
    if (msg) {
      props.onSend(msg);
      setInput("");
    }
  };

  return (
    <box flexDirection="column" flexGrow={1}>
      {/* Chat messages */}
      <scrollbox flexGrow={1} borderStyle="single">
        <For each={props.messages()}>
          {(msg) => (
            <box flexDirection="column" marginBottom={1}>
              <text fg={msg.role === "user" ? theme.colors.info : theme.colors.text}>
                {msg.role === "user" ? "> " : ""}
                {msg.content}
              </text>
            </box>
          )}
        </For>
      </scrollbox>

      {/* Input */}
      <box borderStyle="single" padding={1}>
        <input
          value={input()}
          onInput={(e) => setInput(e.target.value)}
          onSubmit={handleSubmit}
          placeholder={props.placeholder ?? "Type a message..."}
        />
      </box>
    </box>
  );
}
