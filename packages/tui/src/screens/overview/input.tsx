import { createSignal } from "solid-js";

import { ui } from "../../state/ui";
import { getTheme } from "../../theme.ts";

interface OverviewInputProps {
  onSubmit: (msg: string) => void;
  onEmptySubmit: () => void;
}

export function OverviewInput(props: OverviewInputProps) {
  const theme = getTheme();
  const isFocused = () => ui.focusedComponent() === "chat";
  const [inputValue, setInputValue] = createSignal("");

  return (
    <box
      flexDirection="column"
      backgroundColor={
        isFocused() ? theme.colors.selection : theme.colors.surface
      }
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      onMouseDown={() => {
        ui.setFocusedComponent("chat");
        ui.enterInputMode();
      }}
    >
      <box
        flexDirection="row"
        width="100%"
        alignItems="stretch"
        paddingBottom={1}
      >
        <box flexShrink={0}>
          <text fg={theme.colors.accent}>❯ </text>
        </box>
        <box flexGrow={1} flexBasis={0}>
          {!ui.modal() && (
            <input
              width="100%"
              focused={isFocused()}
              value={inputValue()}
              onInput={(v) => setInputValue(v)}
              onSubmit={(value) => {
                const msg = typeof value === "string" ? value.trim() : "";
                if (msg) props.onSubmit(msg);
                else props.onEmptySubmit();
                setInputValue("");
              }}
              placeholder="Type a task or issue key..."
            />
          )}
        </box>
      </box>
    </box>
  );
}
