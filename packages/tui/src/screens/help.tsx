import { StatusBar } from "../components";
import { getTheme } from "../theme.ts";

/**
 * Help screen showing all keyboard shortcuts.
 * Uses background colors for visual organization.
 */
export function Help() {
  const theme = getTheme();

  const Section = (props: { title: string; children: any }) => (
    <box flexDirection="column" marginBottom={2}>
      <box
        backgroundColor={theme.colors.surface}
        paddingLeft={2}
        paddingRight={2}
        marginBottom={1}
      >
        <text fg={theme.colors.accent}>
          <b>{props.title}</b>
        </text>
      </box>
      <box flexDirection="column" paddingLeft={2}>
        {props.children}
      </box>
    </box>
  );

  const Shortcut = (props: { keys: string; description: string }) => (
    <box flexDirection="row" marginBottom={1}>
      <box width={16}>
        <text fg={theme.colors.info}>
          <b>{props.keys}</b>
        </text>
      </box>
      <box flexGrow={1}>
        <text fg={theme.colors.dim}>{props.description}</text>
      </box>
    </box>
  );

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={theme.colors.background}
    >
      {/* Header */}
      <box
        backgroundColor={theme.colors.surface}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
      >
        <text fg={theme.colors.accent}>
          <b>⌨ KEYBOARD SHORTCUTS</b>
        </text>
      </box>

      {/* Content */}
      <box
        flexDirection="column"
        paddingTop={2}
        paddingLeft={2}
        paddingRight={2}
        flexGrow={1}
      >
        <Section title="Command Mode (Ctrl+X, then...)">
          <Shortcut keys="Ctrl+X Q" description="Quit application" />
          <Shortcut keys="Ctrl+X H" description="Show this help screen" />
          <Shortcut keys="Ctrl+X M" description="Select AI model" />
        </Section>

        <Section title="Always Available">
          <Shortcut keys="Tab" description="Switch focus between panels" />
          <Shortcut keys="Shift+Tab" description="Switch focus (reverse)" />
          <Shortcut keys="ESC" description="Close modal / Go back" />
        </Section>

        <Section title="Navigation (when not typing)">
          <Shortcut keys="j/k or ↑/↓" description="Navigate up/down in lists" />
          <Shortcut keys="h/l or ←/→" description="Switch between panels" />
          <Shortcut keys="Enter" description="Select item / Spawn agent" />
        </Section>
      </box>

      {/* Status bar */}
      <StatusBar shortcuts={[{ key: "ESC", action: "back" }]} />
    </box>
  );
}
