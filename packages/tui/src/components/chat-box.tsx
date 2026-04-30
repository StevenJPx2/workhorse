import { type Accessor, createSignal, For } from "solid-js";
import type { ChatMessage } from "../primitives/create-chat.ts";
import { theme } from "../theme.ts";

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
          onInput={(e) => setInput(e)}
          onSubmit={() => {
            const msg = input().trim();
            if (msg) {
              props.onSend(msg);
              setInput("");
            }
          }}
          placeholder={props.placeholder ?? "Type a message..."}
        />
      </box>
    </box>
  );
}
