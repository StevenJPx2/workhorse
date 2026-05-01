import { StatusBar } from "../components";
import { theme } from "../theme.ts";

/**
 * Help screen showing all keyboard shortcuts.
 */
export function Help() {
  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <box borderStyle="single" padding={1}>
        <text>
          <b>Keyboard Shortcuts</b>
        </text>
      </box>

      {/* Content */}
      <box flexDirection="column" padding={2} flexGrow={1}>
        {/* Global */}
        <text>
          <b>Global</b>
        </text>
        <box flexDirection="column" marginLeft={2} marginBottom={1}>
          <box flexDirection="row">
            <text>
              <b>q</b>
            </text>
            <text fg={theme.colors.dim}> Quit</text>
          </box>
          <box flexDirection="row">
            <text>
              <b>?</b>
            </text>
            <text fg={theme.colors.dim}> Help screen</text>
          </box>
          <box flexDirection="row">
            <text>
              <b>ESC</b>
            </text>
            <text fg={theme.colors.dim}> Close modal / Back</text>
          </box>
        </box>

        {/* Overview */}
        <text>
          <b>Overview Screen</b>
        </text>
        <box flexDirection="column" marginLeft={2} marginBottom={1}>
          <box flexDirection="row">
            <text>
              <b>j/k</b>
              {" or "}
              <b>↑/↓</b>
            </text>
            <text fg={theme.colors.dim}> Navigate lists</text>
          </box>
          <box flexDirection="row">
            <text>
              <b>Tab</b>
            </text>
            <text fg={theme.colors.dim}> Switch Issues/Agents</text>
          </box>
          <box flexDirection="row">
            <text>
              <b>Enter</b>
            </text>
            <text fg={theme.colors.dim}> Select item</text>
          </box>
        </box>

        {/* Agent */}
        <text>
          <b>Agent Screen</b>
        </text>
        <box flexDirection="column" marginLeft={2} marginBottom={1}>
          <box flexDirection="row">
            <text>
              <b>j/k</b>
              {" or "}
              <b>↑/↓</b>
            </text>
            <text fg={theme.colors.dim}> Navigate sidebar</text>
          </box>
          <box flexDirection="row">
            <text>
              <b>Enter</b>
            </text>
            <text fg={theme.colors.dim}> Send message</text>
          </box>
          <box flexDirection="row">
            <text>
              <b>s</b>
            </text>
            <text fg={theme.colors.dim}> Stop agent</text>
          </box>
          <box flexDirection="row">
            <text>
              <b>ESC</b>
            </text>
            <text fg={theme.colors.dim}> Back to overview</text>
          </box>
        </box>
      </box>

      {/* Status bar */}
      <StatusBar shortcuts={[{ key: "ESC", action: "back" }]} />
    </box>
  );
}
