/**
 * Main Layout component for Jiratown TUI
 *
 * Provides the shell with header, tab bar, main content area, and footer
 */

import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import { createMemo, type JSX, Show } from "solid-js";
import { CommandPalette } from "../components/command-palette/index.ts";
import { Dialog } from "../components/dialog/index.ts";
import { NotificationBar } from "../components/notification-bar/index.ts";
import { useCommandPalette, useModal } from "../hooks/index.ts";
import type { Notification } from "../hooks/index.ts";
import { useKeyboardContext } from "../lib/keyboard-context.ts";
import { spacing, useTheme } from "../lib/theme/index.ts";
import { createCommands } from "./commands.ts";

export interface LayoutProps {
  /** Current rig name (for display) */
  rig: string | null;
  /** Whether showing all tickets (global view) */
  showAll: boolean;
  /** Sidebar content (TicketSidebar) */
  sidebar?: JSX.Element;
  /** Main content area */
  children?: JSX.Element;
  /** Modal/dialog overlays */
  overlays?: JSX.Element;
  /** Notifications to display in footer */
  notifications?: Notification[];
  /** Number of unread notifications */
  unreadCount?: number;
  /** Whether there are blocking notifications */
  hasBlocking?: boolean;
  /** Callback when quit is requested */
  onQuit?: () => void;
  /** Callback to show add ticket modal */
  onAddTicket?: () => void;
  /** Callback to close current ticket */
  onCloseTicket?: () => void;
  /** Callback to open in Jira */
  onOpenInJira?: () => void;
  /** Callback to escalate */
  onEscalate?: () => void;
  /** Callback to switch agent */
  onSwitchAgent?: () => void;
}

export function Layout(props: LayoutProps) {
  const dimensions = useTerminalDimensions();
  const { theme, themeName, setTheme } = useTheme();
  const keyboard = useKeyboardContext();

  // Use useModal hook for help dialog state
  const helpModal = useModal();

  // Command actions
  const commandActions = {
    addTicket: () => {
      props.onAddTicket?.();
    },
    closeTicket: () => {
      props.onCloseTicket?.();
    },
    openInJira: () => {
      props.onOpenInJira?.();
    },
    escalate: () => {
      props.onEscalate?.();
    },
    switchAgent: () => {
      props.onSwitchAgent?.();
    },
    toggleHelp: () => helpModal.toggle(),
    quit: () => props.onQuit?.(),
    setTheme: setTheme,
    currentTheme: themeName,
  };

  // Create commands list
  const commands = createMemo(() => createCommands(commandActions));

  // Command palette state
  const palette = useCommandPalette({
    commands: commands(),
  });

  // Global keyboard shortcuts
  useKeyboard((key) => {
    // Don't process shortcuts when in input mode
    if (keyboard.isInputMode()) return;

    // Don't process shortcuts when palette is open
    if (palette.isOpen()) return;

    // Don't process shortcuts when help modal is open
    if (helpModal.isOpen()) return;

    // Ticket actions
    if (key.name === "n" || key.name === "+") {
      props.onAddTicket?.();
    }
    if (key.name === "x") {
      props.onCloseTicket?.();
    }
    if (key.name === "o") {
      props.onOpenInJira?.();
    }
    if (key.name === "e") {
      props.onEscalate?.();
    }
    if (key.name === "a") {
      props.onSwitchAgent?.();
    }

    // Theme toggle (cycle through themes)
    if (key.name === "t") {
      const themeOrder: Array<"tokyonight" | "gruvbox" | "default"> = [
        "tokyonight",
        "gruvbox",
        "default",
      ];
      const current = themeName();
      const currentIndex = themeOrder.indexOf(current);
      const nextIndex = (currentIndex + 1) % themeOrder.length;
      setTheme(themeOrder[nextIndex]);
    }

    // App actions
    if (key.name === "q" && !key.ctrl && !key.meta) {
      props.onQuit?.();
    }
    if (key.name === "?" || (key.name === "/" && key.shift)) {
      helpModal.toggle();
    }
    if (key.name === "escape") {
      helpModal.close();
    }
    // Vim-style command palette trigger
    if (key.name === ":" || key.name === ";") {
      palette.open();
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
      backgroundColor={theme().bg.shell}
    >
      {/* Main Content Area - Horizontal layout with sidebar */}
      <box flexGrow={1} flexDirection="row">
        {/* Sidebar - full height, elevated background */}
        {props.sidebar}

        {/* Main content - takes remaining space */}
        <box
          flexGrow={1}
          flexDirection="column"
          backgroundColor={theme().bg.base}
        >
          {props.children}
        </box>
      </box>

      {/* Footer - Status bar with notifications and helpers */}
      <box
        height={1}
        flexDirection="row"
        justifyContent="space-between"
        backgroundColor={theme().bg.elevated}
        paddingLeft={spacing.sm}
        paddingRight={spacing.sm}
      >
        <NotificationBar
          notifications={props.notifications ?? []}
          unreadCount={props.unreadCount ?? 0}
          hasBlocking={props.hasBlocking ?? false}
        />
        <text fg={theme().text.secondary}>
          {rigDisplay()} | [:] commands | [?] help | [q] quit
        </text>
      </box>

      {/* Help Modal */}
      <Show when={helpModal.isOpen()}>
        <HelpDialog onClose={helpModal.close} />
      </Show>

      {/* Command Palette */}
      <CommandPalette palette={palette} />

      {/* Additional overlays (modals, dialogs) */}
      {props.overlays}
    </box>
  );
}

interface HelpDialogProps {
  onClose: () => void;
}

function HelpDialog(props: HelpDialogProps) {
  const { theme } = useTheme();

  // Close on any key press
  useKeyboard(() => {
    props.onClose();
  });

  const shortcuts = [
    { key: ":", desc: "Command palette" },
    { key: "+/n", desc: "Add new ticket" },
    { key: "j/k", desc: "Navigate tickets" },
    { key: "1-9", desc: "Jump to ticket" },
    { key: "x", desc: "Close current ticket" },
    { key: "o", desc: "Open in Jira" },
    { key: "e", desc: "Escalate / ask question" },
    { key: "a", desc: "Switch agent" },
    { key: "t", desc: "Toggle theme" },
    { key: "?", desc: "Toggle help" },
    { key: "q", desc: "Quit" },
  ];

  return (
    <Dialog
      isOpen={true}
      onClose={props.onClose}
      lockId="help-dialog"
      title="Keyboard Shortcuts"
      hint="Press any key to close"
      width={40}
      height={18}
      closeOnEscape={false}
    >
      <box flexDirection="column">
        {shortcuts.map((s) => (
          <box flexDirection="row" height={1}>
            <box width={8}>
              <text fg={theme().primary}>[{s.key}]</text>
            </box>
            <text fg={theme().text.primary}>{s.desc}</text>
          </box>
        ))}
      </box>
    </Dialog>
  );
}
