import { type Accessor, createSignal, For, Show } from "solid-js";
import type { ChatMessage } from "../primitives/create-chat.ts";
import { getTheme } from "../theme.ts";

interface ChatBoxProps {
  messages: Accessor<ChatMessage[]>;
  onSend: (message: string) => void;
  placeholder?: string;
}

/**
 * Chat component with scrollable message history and input field.
 * Uses background colors for message distinction.
 */
export function ChatBox(props: ChatBoxProps) {
  const [input, setInput] = createSignal("");
  const theme = getTheme();

  return (
    <box flexDirection="column" flexGrow={1} backgroundColor={theme.colors.background}>
      {/* Chat messages */}
      <scrollbox flexGrow={1} paddingLeft={2} paddingRight={2} paddingTop={1}>
        <For each={props.messages()}>
          {(msg) => (
            <box flexDirection="column" marginBottom={1}>
              <Show
                when={msg.role === "user"}
                fallback={
                  // Agent message
                  <box flexDirection="column">
                    <text fg={theme.colors.success}>
                      <b>Agent</b>
                    </text>
                    <box
                      backgroundColor={theme.colors.surface}
                      paddingLeft={1}
                      paddingRight={1}
                      marginTop={0}
                    >
                      <text fg={theme.colors.text}>{msg.content}</text>
                    </box>
                  </box>
                }
              >
                {/* User message */}
                <box flexDirection="column" alignItems="flex-end">
                  <text fg={theme.colors.accent}>
                    <b>You</b>
                  </text>
                  <box
                    backgroundColor={theme.colors.selection}
                    paddingLeft={1}
                    paddingRight={1}
                    marginTop={0}
                  >
                    <text fg={theme.colors.info}>{msg.content}</text>
                  </box>
                </box>
              </Show>
            </box>
          )}
        </For>
        {props.messages().length === 0 && (
          <box justifyContent="center" alignItems="center" flexGrow={1}>
            <text fg={theme.colors.dim}>No messages yet. Start typing below...</text>
          </box>
        )}
      </scrollbox>

      {/* Input area */}
      <box
        backgroundColor={theme.colors.surface}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
      >
        <text fg={theme.colors.accent}>❯ </text>
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
