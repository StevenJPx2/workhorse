/**
 * Main Layout component for Jiratown TUI
 *
 * Provides the shell with header, tab bar, main content area, and footer
 */

import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import { createSignal, type JSX, Show } from "solid-js";
import { TabBar } from "../components/TabBar.tsx";

export interface LayoutProps {
  /** Current rig name (for display) */
  rig: string | null;
  /** Whether showing all tickets (global view) */
  showAll: boolean;
  /** Children content */
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
    >
      {/* Header */}
      <box
        height={1}
        flexDirection="row"
        justifyContent="space-between"
        paddingLeft={1}
        paddingRight={1}
      >
        <text bold color="cyan">
          Jiratown
        </text>
        <text color="gray">
          {rigDisplay()} | [?] help | [q] quit
        </text>
      </box>

      {/* Tab Bar */}
      <TabBar />

      {/* Separator */}
      <box height={1} borderTop="single" borderColor="gray" />

      {/* Main Content */}
      <box flexGrow={1} flexDirection="column">
        {props.children}
      </box>

      {/* Footer / Notifications */}
      <box
        height={1}
        borderTop="single"
        borderColor="gray"
        paddingLeft={1}
      >
        <text color="gray">Ready</text>
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
      border="round"
      borderColor="cyan"
      flexDirection="column"
      padding={1}
    >
      <text bold color="cyan">
        Keyboard Shortcuts
      </text>
      <box height={1} />
      <text>  [+] or [n]  Add new ticket</text>
      <text>  [Tab]       Switch tabs</text>
      <text>  [1-9]       Jump to tab</text>
      <text>  [x]         Close current ticket</text>
      <text>  [j]         Open in Jira</text>
      <text>  [e]         Escalate / ask question</text>
      <text>  [a]         Switch agent</text>
      <text>  [?]         Toggle help</text>
      <text>  [q]         Quit</text>
      <box flexGrow={1} />
      <text color="gray">Press any key to close</text>
    </box>
  );
}
