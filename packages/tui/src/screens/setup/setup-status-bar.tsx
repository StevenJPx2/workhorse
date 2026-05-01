import { Show } from "solid-js";
import { getTheme } from "../../theme.ts";

interface SetupStatusBarProps {
  inputMode: boolean;
  showSkip: boolean;
}

export function SetupStatusBar(props: SetupStatusBarProps) {
  const theme = getTheme();

  return (
    <box
      backgroundColor={theme.colors.surface}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
    >
      <Show
        when={props.inputMode}
        fallback={
          <box flexDirection="row" gap={3}>
            <box>
              <text fg={theme.colors.accent}>
                <b>Enter/e</b>
              </text>
              <text fg={theme.colors.dim}> edit</text>
            </box>
            <box>
              <text fg={theme.colors.accent}>
                <b>j/k</b>
              </text>
              <text fg={theme.colors.dim}> navigate</text>
            </box>
            <box>
              <text fg={theme.colors.success}>
                <b>s</b>
              </text>
              <text fg={theme.colors.dim}> save & continue</text>
            </box>
            <Show when={props.showSkip}>
              <box>
                <text fg={theme.colors.warning}>
                  <b>ESC</b>
                </text>
                <text fg={theme.colors.dim}> skip</text>
              </box>
            </Show>
          </box>
        }
      >
        <box flexDirection="row" gap={3}>
          <box>
            <text fg={theme.colors.success}>
              <b>Enter</b>
            </text>
            <text fg={theme.colors.dim}> save</text>
          </box>
          <box>
            <text fg={theme.colors.warning}>
              <b>ESC</b>
            </text>
            <text fg={theme.colors.dim}> cancel</text>
          </box>
        </box>
      </Show>
    </box>
  );
}
