import { For } from "solid-js";
import { useRenderer } from "@opentui/solid";
import { getTheme } from "../theme.ts";
import { ui } from "../state/ui.ts";

interface Shortcut {
  key: string;
  action: string;
  onActivate?: () => void;
}

interface StatusBarProps {
  shortcuts: Shortcut[];
}

/**
 * Bottom status bar showing available keyboard shortcuts.
 * Uses surface background for visual separation.
 * Shortcuts are clickable via onMouseDown.
 */
export function StatusBar(props: StatusBarProps) {
  const theme = getTheme();
  const renderer = useRenderer();

  const handleQuit = () => {
    renderer.destroy();
  };

  const handleShortcutClick = (shortcut: Shortcut) => {
    if (shortcut.onActivate) {
      shortcut.onActivate();
    } else {
      // Default actions based on common shortcut names
      switch (shortcut.action) {
        case "back":
          ui.backToOverview();
          break;
        case "help":
          ui.setScreen("help");
          break;
        case "close":
          ui.closeModal();
          break;
      }
    }
  };

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      backgroundColor={theme.colors.surface}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
    >
      <box flexDirection="row" gap={3}>
        <For each={props.shortcuts}>
          {(shortcut) => (
            <box flexDirection="row" onMouseDown={() => handleShortcutClick(shortcut)}>
              <text fg={theme.colors.accent}>
                <b>{shortcut.key}</b>
              </text>
              <text fg={theme.colors.dim}> {shortcut.action}</text>
            </box>
          )}
        </For>
      </box>
      <box flexDirection="row" onMouseDown={handleQuit}>
        <text fg={theme.colors.accent}>
          <b>Ctrl+X Q</b>
        </text>
        <text fg={theme.colors.dim}> quit</text>
      </box>
    </box>
  );
}
