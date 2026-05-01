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
      <box backgroundColor={theme.colors.surface} paddingLeft={2} paddingRight={2} marginBottom={1}>
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
    <box flexDirection="row" marginBottom={0}>
      <box width={12}>
        <text fg={theme.colors.info}>
          <b>{props.keys}</b>
        </text>
      </box>
      <text fg={theme.colors.dim}>{props.description}</text>
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
      <box flexDirection="column" paddingTop={2} paddingLeft={2} paddingRight={2} flexGrow={1}>
        <Section title="Global">
          <Shortcut keys="q" description="Quit application" />
          <Shortcut keys="? or h" description="Show this help screen" />
          <Shortcut keys="ESC" description="Close modal / Go back" />
        </Section>

        <Section title="Overview Screen">
          <Shortcut keys="j / k" description="Navigate up/down in lists" />
          <Shortcut keys="↑ / ↓" description="Navigate up/down in lists" />
          <Shortcut keys="Tab" description="Switch between Issues and Agents" />
          <Shortcut keys="Enter" description="Select item / Spawn agent" />
        </Section>

        <Section title="Agent Screen">
          <Shortcut keys="j / k" description="Navigate agents in sidebar" />
          <Shortcut keys="Enter" description="Send message" />
          <Shortcut keys="s" description="Stop current agent" />
          <Shortcut keys="ESC" description="Return to overview" />
        </Section>
      </box>

      {/* Status bar */}
      <StatusBar shortcuts={[{ key: "ESC", action: "back" }]} />
    </box>
  );
}
