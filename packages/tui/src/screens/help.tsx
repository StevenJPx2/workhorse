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
          <text>
            <b>q</b> <text fg={theme.colors.dim}>Quit</text>
          </text>
          <text>
            <b>?</b> <text fg={theme.colors.dim}>Help screen</text>
          </text>
          <text>
            <b>ESC</b> <text fg={theme.colors.dim}>Close modal / Back</text>
          </text>
        </box>

        {/* Overview */}
        <text>
          <b>Overview Screen</b>
        </text>
        <box flexDirection="column" marginLeft={2} marginBottom={1}>
          <text>
            <b>j/k</b> or <b>↑/↓</b> <text fg={theme.colors.dim}>Navigate lists</text>
          </text>
          <text>
            <b>Tab</b> <text fg={theme.colors.dim}>Switch Issues/Agents</text>
          </text>
          <text>
            <b>Enter</b> <text fg={theme.colors.dim}>Select item</text>
          </text>
        </box>

        {/* Agent */}
        <text>
          <b>Agent Screen</b>
        </text>
        <box flexDirection="column" marginLeft={2} marginBottom={1}>
          <text>
            <b>j/k</b> or <b>↑/↓</b> <text fg={theme.colors.dim}>Navigate sidebar</text>
          </text>
          <text>
            <b>Enter</b> <text fg={theme.colors.dim}>Send message</text>
          </text>
          <text>
            <b>s</b> <text fg={theme.colors.dim}>Stop agent</text>
          </text>
          <text>
            <b>ESC</b> <text fg={theme.colors.dim}>Back to overview</text>
          </text>
        </box>
      </box>

      {/* Status bar */}
      <StatusBar shortcuts={[{ key: "ESC", action: "back" }]} />
    </box>
  );
}
