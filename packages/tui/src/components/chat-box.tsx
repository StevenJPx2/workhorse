import { type Accessor, For, Show } from "solid-js";

import type { ChatMessage } from "../primitives/create-chat.ts";
import { ui } from "../state/ui";
import { getTheme } from "../theme.ts";

interface ChatBoxProps {
  messages: Accessor<ChatMessage[]>;
  onSend: (message: string) => void | Promise<void>;
  placeholder?: string;
}

/**
 * Chat component with scrollable message history and input field.
 * Uses background colors for message distinction.
 * Click anywhere on the component to focus the input.
 */
export function ChatBox(props: ChatBoxProps) {
  const theme = getTheme();

  // Check if this component is focused (driven by global state)
  const isFocused = () => ui.focusedComponent() === "chat";

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      backgroundColor={theme.colors.background}
      onMouseDown={() => {
        ui.setFocusedComponent("chat");
        ui.enterInputMode();
      }}
    >
      {/* Chat messages - disable focus when modal is open */}
      <scrollbox flexGrow={1} paddingLeft={2} paddingRight={2} paddingTop={1} focused={!ui.modal()}>
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

      {/* Input area - highlighted when focused */}
      <box
        flexDirection="row"
        width="100%"
        alignItems="stretch"
        backgroundColor={isFocused() ? theme.colors.selection : theme.colors.surface}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
      >
        <box flexShrink={0}>
          <text fg={theme.colors.accent}>❯ </text>
        </box>
        <box flexGrow={1} flexBasis={0}>
          <input
            width="100%"
            focused={isFocused()}
            onSubmit={(value) => {
              // value can be string or SubmitEvent - handle both
              const msg = typeof value === "string" ? value.trim() : "";
              if (msg) {
                props.onSend(msg);
              }
            }}
            placeholder={props.placeholder ?? "Type a message..."}
          />
        </box>
      </box>
    </box>
  );
}
