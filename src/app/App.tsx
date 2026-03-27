/**
 * Root App component for Jiratown TUI
 *
 * Manages global state and renders the main layout
 */

import { createSignal, createEffect, onCleanup } from "solid-js";
import { useRenderer } from "@opentui/solid";
import { Layout } from "./Layout.tsx";
import { TabBar } from "../components/TabBar.tsx";
import { getTicketsByRig, getAllTickets, initDatabase } from "../lib/db.ts";
import { detectRig } from "../lib/detect-rig.ts";
import type { Ticket } from "../types/ticket.ts";

export interface AppProps {
  /** Show all tickets across all repositories */
  showAll?: boolean;
}

export function App(props: AppProps) {
  const renderer = useRenderer();
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

  const handleSelectTab = (index: number) => {
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
    >
      {/* Tab bar with tickets */}
      <TabBar
        tickets={tickets()}
        selectedIndex={selectedIndex()}
        onSelect={handleSelectTab}
        onNew={handleNewTicket}
      />

      {/* Main content area */}
      <box flexGrow={1} padding={1}>
        {loading() ? (
          <text color="gray">Loading...</text>
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
  return (
    <box flexDirection="column" gap={1}>
      {/* Ticket header */}
      <text bold color="white">
        {props.ticket.id}: {props.ticket.summary ?? "No summary"}
      </text>

      {/* Status line */}
      <box flexDirection="row" gap={2}>
        <text>
          Status: <text color="cyan">{props.ticket.status.toUpperCase()}</text>
        </text>
        <text>
          Agent: <text color="yellow">{props.ticket.agent}</text>
        </text>
      </box>

      {/* Actions */}
      <box height={1} />
      <text color="gray">
        [e] escalate  [a] switch agent  [j] open jira  [x] close
      </text>
    </box>
  );
}

interface EmptyStateProps {
  showAll: boolean;
  rig: string | null;
}

function EmptyState(props: EmptyStateProps) {
  return (
    <box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
      <text color="gray">No tickets</text>
      <box height={1} />
      <text color="gray">
        Press [+] or [n] to add a ticket
      </text>
      {!props.showAll && props.rig && (
        <>
          <box height={1} />
          <text color="gray" dim>
            Showing tickets for: {props.rig}
          </text>
        </>
      )}
    </box>
  );
}
