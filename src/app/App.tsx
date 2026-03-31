/**
 * Root App component for Jiratown TUI
 *
 * Manages global state and renders the main layout
 */

import { createSignal, createEffect } from "solid-js";
import { useRenderer } from "@opentui/solid";
import { Layout } from "./Layout.tsx";
import {
  TicketSidebar,
  SIDEBAR_WIDTH,
} from "../components/ticket-sidebar/index.ts";
import { getTicketsByRig, getAllTickets, initDatabase } from "../lib/db.ts";
import { detectRig } from "../lib/detect-rig.ts";
import { loadConfig, saveTheme } from "../lib/config.ts";
import {
  spacing,
  getStatusConfig,
  getAgentColor,
  ThemeProvider,
  useTheme,
} from "../lib/theme/index.ts";
import { ActionBar } from "../components/button/index.ts";
import type { Ticket } from "../types/ticket.ts";
import type { ThemeName } from "../types/config.ts";

export interface AppProps {
  /** Show all tickets across all repositories */
  showAll?: boolean;
  /** Initial theme from config */
  initialTheme?: ThemeName;
}

/**
 * Root App component wrapped with ThemeProvider
 */
export function App(props: AppProps) {
  const [initialTheme, setInitialTheme] = createSignal<ThemeName>(
    props.initialTheme ?? "default"
  );

  // Load theme from config on mount
  createEffect(async () => {
    const config = await loadConfig();
    setInitialTheme(config.ui.theme);
  });

  const handleThemeChange = (themeName: ThemeName) => {
    // Persist theme to config (fire and forget)
    saveTheme(themeName).catch(console.error);
  };

  return (
    <ThemeProvider
      initialTheme={initialTheme()}
      onThemeChange={handleThemeChange}
    >
      <AppContent showAll={props.showAll} />
    </ThemeProvider>
  );
}

interface AppContentProps {
  showAll?: boolean;
}

/**
 * Main app content (inside ThemeProvider)
 */
function AppContent(props: AppContentProps) {
  const renderer = useRenderer();
  const { theme } = useTheme();
  const [rig, setRig] = createSignal<string | null>(null);
  const [tickets, setTickets] = createSignal<Ticket[]>([]);
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [loading, setLoading] = createSignal(true);

  // Initialize on mount
  createEffect(async () => {
    try {
      // Initialize database
      initDatabase();

      // Detect current rig
      const rigInfo = await detectRig();
      if (rigInfo) {
        setRig(rigInfo.rig);
      }

      // Load tickets
      if (props.showAll) {
        setTickets(getAllTickets());
      } else if (rigInfo) {
        setTickets(getTicketsByRig(rigInfo.rig));
      }
    } finally {
      setLoading(false);
    }
  });

  const handleQuit = () => {
    renderer.destroy();
  };

  const handleSelect = (index: number) => {
    setSelectedIndex(index);
  };

  const handleNewTicket = () => {
    // TODO: Show new ticket modal
    console.log("New ticket requested");
  };

  const currentTicket = () => {
    const t = tickets();
    const idx = selectedIndex();
    return t[idx] ?? null;
  };

  return (
    <Layout
      rig={rig()}
      showAll={props.showAll ?? false}
      onQuit={handleQuit}
      sidebar={
        <TicketSidebar
          tickets={tickets()}
          selectedIndex={selectedIndex()}
          width={SIDEBAR_WIDTH}
          onSelect={handleSelect}
          onNew={handleNewTicket}
        />
      }
    >
      {/* Main content area */}
      <box flexGrow={1} padding={spacing.sm}>
        {loading() ? (
          <text fg={theme().text.dim}>Loading...</text>
        ) : currentTicket() ? (
          <TicketView ticket={currentTicket()!} />
        ) : (
          <EmptyState showAll={props.showAll ?? false} rig={rig()} />
        )}
      </box>
    </Layout>
  );
}

interface TicketViewProps {
  ticket: Ticket;
}

function TicketView(props: TicketViewProps) {
  const { theme } = useTheme();
  const statusConfig = () => getStatusConfig(props.ticket.status, theme());
  const agentColor = () => getAgentColor(props.ticket.agent, theme());

  return (
    <box flexDirection="column" gap={spacing.sm} flexGrow={1}>
      {/* Ticket header */}
      <text fg={theme().text.primary}>
        <strong>
          {props.ticket.id}: {props.ticket.summary ?? "No summary"}
        </strong>
      </text>

      {/* Status and agent info */}
      <box flexDirection="row" gap={spacing.lg}>
        <box flexDirection="row">
          <text fg={theme().text.secondary}>Status: </text>
          <text fg={statusConfig().color}>
            {statusConfig().indicator} {statusConfig().label}
          </text>
        </box>
        <box flexDirection="row">
          <text fg={theme().text.secondary}>Agent: </text>
          <text fg={agentColor()}>{props.ticket.agent}</text>
        </box>
      </box>

      {/* Spacer */}
      <box flexGrow={1} />

      {/* Actions hint */}
      <ActionBar
        actions={[
          { key: "e", action: "escalate" },
          { key: "a", action: "switch agent" },
          { key: "j", action: "open jira" },
          { key: "x", action: "close" },
        ]}
      />
    </box>
  );
}

interface EmptyStateProps {
  showAll: boolean;
  rig: string | null;
}

function EmptyState(props: EmptyStateProps) {
  const { theme } = useTheme();

  return (
    <box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      flexGrow={1}
    >
      <text fg={theme().text.secondary}>No tickets</text>
      <box height={1} />
      <text fg={theme().text.dim}>Press [+] or [n] to add a ticket</text>
      {!props.showAll && props.rig && (
        <>
          <box height={1} />
          <text fg={theme().text.dim}>
            <em>Showing tickets for: {props.rig}</em>
          </text>
        </>
      )}
    </box>
  );
}
