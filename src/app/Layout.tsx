/**
 * Main Layout component for Jiratown TUI
 *
 * Provides the shell with header, main content area, and footer.
 * Uses composables directly instead of receiving handler props.
 */

import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import { createMemo, type JSX, Show } from "solid-js";
import { CommandPalette } from "../components/command-palette/index.ts";
import { NotificationBar } from "../components/notification-bar/index.ts";
import { TicketSidebar, SIDEBAR_WIDTH } from "../components/ticket-sidebar/index.ts";
import { HelpDialog } from "./help-dialog.tsx";
import { useCommandPalette, useModal, useNotifications, useLayoutActions } from "../hooks/index.ts";
import { useTicketsContext } from "../lib/tickets-context.tsx";
import { useKeyboardContext } from "../lib/keyboard-context.ts";
import { spacing, useTheme } from "../lib/theme/index.ts";
import { createCommands } from "./commands.ts";

export interface LayoutProps {
  /** Current rig name (for display) */
  rig: string | null;
  /** Whether showing all tickets (global view) */
  showAll: boolean;
  /** Main content area */
  children?: JSX.Element;
  /** Quit callback from renderer */
  onQuit: () => void | Promise<void>;
}

export function Layout(props: LayoutProps) {
  const dimensions = useTerminalDimensions();
  const { theme, themeName, setTheme } = useTheme();
  const keyboard = useKeyboardContext();

  // Get tickets and selection from context
  const { tickets, selection, currentTicket, actions: ticketActions } = useTicketsContext();

  // Notifications for the current ticket (defined where used)
  const notifications = useNotifications({
    ticketId: () => currentTicket()?.id,
    autoLoad: true,
    pollInterval: 5000,
  });

  // Help dialog (local modal, not in global system)
  const helpModal = useModal();

  // Layout actions (uses contexts internally: TicketsContext, WorkflowContext, ModalSystem)
  const layoutActions = useLayoutActions({
    currentTicketId: () => currentTicket()?.id,
    reloadTickets: ticketActions.reload,
    onQuit: props.onQuit,
  });

  // Command actions for command palette
  const commandActions = {
    addTicket: layoutActions.addTicket,
    closeTicket: layoutActions.closeTicket,
    openInJira: layoutActions.openInJira,
    escalate: layoutActions.escalate,
    switchAgent: layoutActions.switchAgent,
    toggleAgent: layoutActions.toggleAgent,
    toggleHelp: () => helpModal.toggle(),
    quit: layoutActions.quit,
    setTheme,
    currentTheme: themeName,
  };

  // Create commands list
  const commands = createMemo(() => createCommands(commandActions));

  // Command palette state
  const palette = useCommandPalette({ commands: commands() });

  // Global keyboard shortcuts
  useKeyboard((key) => {
    // Don't process shortcuts when in input mode or modals open
    if (keyboard.isInputMode()) return;
    if (palette.isOpen()) return;
    if (helpModal.isOpen()) return;

    // Ticket actions
    if (key.name === "n" || key.name === "+") layoutActions.addTicket();
    if (key.name === "x") layoutActions.closeTicket();
    if (key.name === "o") layoutActions.openInJira();
    if (key.name === "e") layoutActions.escalate();
    if (key.name === "a") layoutActions.switchAgent();
    if (key.name === "s") layoutActions.toggleAgent();

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
    if (key.name === "q" && !key.ctrl && !key.meta) layoutActions.quit();
    if (key.name === "?" || (key.name === "/" && key.shift)) helpModal.toggle();
    if (key.name === "escape") helpModal.close();
    if (key.name === ":" || key.name === ";") palette.open();
  });

  const rigDisplay = () => {
    if (props.showAll) return "all repos";
    if (props.rig) {
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
        <TicketSidebar
          tickets={tickets}
          selectedIndex={selection.selectedIndex()}
          width={SIDEBAR_WIDTH}
          onSelect={(i) => selection.select(i)}
          onNew={layoutActions.addTicket}
        />

        {/* Main content - takes remaining space */}
        <box flexGrow={1} flexDirection="column" backgroundColor={theme().bg.base}>
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
          notifications={notifications.notifications()}
          unreadCount={notifications.unreadCount()}
          hasBlocking={notifications.hasBlocking()}
        />
        <text fg={theme().text.secondary}>{rigDisplay()} | [:] commands | [?] help | [q] quit</text>
      </box>

      {/* Help Modal */}
      <Show when={helpModal.isOpen()}>
        <HelpDialog onClose={helpModal.close} />
      </Show>

      {/* Command Palette */}
      <CommandPalette palette={palette} />
    </box>
  );
}
