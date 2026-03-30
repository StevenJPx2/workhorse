/**
 * Main Layout component for Jiratown TUI
 *
 * Provides the shell with header, tab bar, main content area, and footer
 */

import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import { createSignal, type JSX, Show } from "solid-js";
import { colors, spacing } from "../lib/theme/index.ts";

export interface LayoutProps {
  /** Current rig name (for display) */
  rig: string | null;
  /** Whether showing all tickets (global view) */
  showAll: boolean;
  /** Sidebar content (TicketSidebar) */
  sidebar?: JSX.Element;
  /** Main content area */
  children?: JSX.Element;
  /** Callback when quit is requested */
  onQuit?: () => void;
}

export function Layout(props: LayoutProps) {
  const dimensions = useTerminalDimensions();
  const [showHelp, setShowHelp] = createSignal(false);

  // Global keyboard shortcuts
  useKeyboard((key) => {
    if (key.name === "q" && !key.ctrl && !key.meta) {
      props.onQuit?.();
    }
    if (key.name === "?" || (key.name === "/" && key.shift)) {
      setShowHelp((prev) => !prev);
    }
    if (key.name === "escape") {
      setShowHelp(false);
    }
  });

  const rigDisplay = () => {
    if (props.showAll) {
      return "all repos";
    }
    if (props.rig) {
      // Extract just the repo name from the full path
      const parts = props.rig.split("/");
      return parts[parts.length - 1] || props.rig;
    }
    return "unknown";
  };

  return (
    <box
      width={dimensions().width}
      height={dimensions().height}
      flexDirection="column"
      backgroundColor={colors.bg.shell}
    >
      {/* Main Content Area - Horizontal layout with sidebar */}
      <box flexGrow={1} flexDirection="row">
        {/* Sidebar - full height, elevated background */}
        {props.sidebar}

        {/* Main content - takes remaining space */}
        <box flexGrow={1} flexDirection="column" backgroundColor={colors.bg.base}>
          {props.children}
        </box>
      </box>

      {/* Footer - Status bar with notifications and helpers */}
      <box
        height={1}
        flexDirection="row"
        justifyContent="space-between"
        backgroundColor={colors.bg.elevated}
        paddingLeft={spacing.sm}
        paddingRight={spacing.sm}
      >
        <text fg={colors.text.dim}>No notifications</text>
        <text fg={colors.text.secondary}>
          {rigDisplay()} | [?] help | [q] quit
        </text>
      </box>

      {/* Help Modal */}
      <Show when={showHelp()}>
        <HelpModal onClose={() => setShowHelp(false)} />
      </Show>
    </box>
  );
}

interface HelpModalProps {
  onClose: () => void;
}

function HelpModal(props: HelpModalProps) {
  const dimensions = useTerminalDimensions();

  const modalWidth = 50;
  const modalHeight = 15;
  const left = () => Math.floor((dimensions().width - modalWidth) / 2);
  const top = () => Math.floor((dimensions().height - modalHeight) / 2);

  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "q" || key.name === "?") {
      props.onClose();
    }
  });

  return (
    <box
      position="absolute"
      left={left()}
      top={top()}
      width={modalWidth}
      height={modalHeight}
      border={true}
      borderStyle="rounded"
      borderColor={colors.primary}
      backgroundColor={colors.bg.elevated}
      flexDirection="column"
      padding={spacing.sm}
    >
      <text fg={colors.primary}>
        <strong>Keyboard Shortcuts</strong>
      </text>
      <box height={1} />
      <text fg={colors.text.primary}>  [+] or [n]  Add new ticket</text>
      <text fg={colors.text.primary}>  [j] / [k]   Navigate tickets</text>
      <text fg={colors.text.primary}>  [1-9]       Jump to ticket</text>
      <text fg={colors.text.primary}>  [x]         Close current ticket</text>
      <text fg={colors.text.primary}>  [o]         Open in Jira</text>
      <text fg={colors.text.primary}>  [e]         Escalate / ask question</text>
      <text fg={colors.text.primary}>  [a]         Switch agent</text>
      <text fg={colors.text.primary}>  [?]         Toggle help</text>
      <text fg={colors.text.primary}>  [q]         Quit</text>
      <box flexGrow={1} />
      <text fg={colors.text.dim}>Press any key to close</text>
    </box>
  );
}
