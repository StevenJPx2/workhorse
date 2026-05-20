import type { Accessor } from "solid-js";

import type { ChatMessage } from "../../primitives/create-chat.ts";
import { ui } from "../../state/ui.ts";
import { getTheme } from "../../theme.ts";

interface OverviewInputProps {
  messages: Accessor<ChatMessage[]>;
  chatContextId: Accessor<string | null>;
  onSubmit: (msg: string) => void;
  onEmptySubmit: () => void;
}

export function OverviewInput(props: OverviewInputProps) {
  const theme = getTheme();
  const isFocused = () => ui.focusedComponent() === "chat";

  return (
    <box
      flexDirection="column"
      backgroundColor={isFocused() ? theme.colors.selection : theme.colors.surface}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      onMouseDown={() => {
        ui.setFocusedComponent("chat");
        ui.enterInputMode();
      }}
    >
      {props.messages().length > 0 && (
        <box flexDirection="column" marginBottom={1}>
          {props
            .messages()
            .slice(-3)
            .map((msg) => (
              <text fg={msg.role === "user" ? theme.colors.info : theme.colors.success}>
                {msg.role === "user" ? "You: " : "Agent: "}
                {msg.content.slice(0, 60)}
                {msg.content.length > 60 ? "..." : ""}
              </text>
            ))}
        </box>
      )}
      <box flexDirection="row" width="100%" alignItems="stretch" paddingBottom={1}>
        <box flexShrink={0}>
          <text fg={theme.colors.accent}>
            {props.chatContextId() ? `[${props.chatContextId()}] ❯ ` : "❯ "}
          </text>
        </box>
        <box flexGrow={1} flexBasis={0}>
          {!ui.modal() && (
            <input
              width="100%"
              focused={isFocused()}
              onSubmit={(value) => {
                const msg = typeof value === "string" ? value.trim() : "";
                if (msg) props.onSubmit(msg);
                else props.onEmptySubmit();
              }}
              placeholder={
                props.chatContextId()
                  ? `Message agent ${props.chatContextId()}...`
                  : "Type a task or issue key..."
              }
            />
          )}
        </box>
      </box>
    </box>
  );
}
