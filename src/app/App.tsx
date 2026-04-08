/**
 * Root App component for Jiratown TUI
 *
 * Manages global state and renders the main layout
 */

import { createSignal, createEffect, Show } from "solid-js";
import { useRenderer } from "@opentui/solid";
import { Layout } from "./Layout.tsx";
import { EmptyState } from "./empty-state.tsx";
import { TicketSidebar, SIDEBAR_WIDTH } from "../components/ticket-sidebar/index.ts";
import { TicketPane } from "../components/ticket-pane/index.ts";
import { TicketInput } from "../components/ticket-input/index.ts";
import { initDatabase } from "../lib/db.ts";
import { detectRig, type RigInfo } from "../lib/detect-rig.ts";
import { spacing, ThemeProvider, useTheme } from "../lib/theme/index.ts";
import { NavigationProvider } from "../lib/navigation-provider.tsx";
import { KeyboardProvider } from "../lib/keyboard-provider.tsx";
import {
  useTickets,
  useSelection,
  useConfig,
  useAtlassian,
  useTicketWorkflow,
  useNotifications,
} from "../hooks/index.ts";
import type { ThemeName, AgentType } from "../types/config.ts";
import type { Ticket } from "../types/ticket.ts";
import type { JiraIssue } from "../hooks/use-atlassian/index.ts";

export interface AppProps {
  showAll?: boolean;
  initialTheme?: ThemeName;
}

/**
 * Root App component wrapped with providers
 */
export function App(props: AppProps) {
  const [theme, setTheme] = createSignal<ThemeName>(props.initialTheme ?? "default");
  const config = useConfig({ autoLoad: true });

  createEffect(() => {
    const loaded = config.config();
    if (loaded) setTheme(loaded.ui.theme);
  });

  return (
    <ThemeProvider initialTheme={theme()} onThemeChange={(t) => config.setTheme(t)}>
      <NavigationProvider>
        <KeyboardProvider>
          <AppContent showAll={props.showAll} />
        </KeyboardProvider>
      </NavigationProvider>
    </ThemeProvider>
  );
}

function AppContent(props: { showAll?: boolean }) {
  const renderer = useRenderer();
  const { theme } = useTheme();
  const [rigInfo, setRigInfo] = createSignal<RigInfo | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [showTicketInput, setShowTicketInput] = createSignal(false);

  const config = useConfig({ autoLoad: true });
  const cloudId = () => config.config()?.jira.cloud_id;
  const rig = () => rigInfo()?.rig ?? undefined;
  const gitRoot = () => rigInfo()?.gitRoot;

  // Pass cloudId as a getter so it resolves lazily after config loads
  const atlassian = useAtlassian({ cloudId, autoConnect: false });
  const tickets = useTickets({ rig, autoLoad: false });
  const selection = useSelection({ items: tickets.tickets, wrap: true, initialIndex: 0 });

  const workflow = useTicketWorkflow({
    repoPath: gitRoot,
    jiraCloudId: cloudId,
    onError: (err) => console.error("Workflow error:", err),
  });

  // Notifications for the current ticket
  const notifications = useNotifications({
    ticketId: () => currentTicket()?.id,
    autoLoad: true,
    pollInterval: 5000, // Poll every 5 seconds
  });

  createEffect(async () => {
    try {
      initDatabase();
      const info = await detectRig();
      if (info) setRigInfo(info);
      tickets.reload();
    } finally {
      setLoading(false);
    }
  });

  // Global shortcuts are handled in Layout.tsx

  const currentTicket = () => selection.selectedItem();

  const handleTicketSubmit = async (key: string, agent: AgentType, issue: JiraIssue) => {
    const rigValue = rig();
    if (!rigValue) {
      console.error("Cannot add ticket: no rig detected");
      return;
    }

    // Create ticket first (this updates the sidebar immediately)
    const ticket = tickets.create({
      jiraKey: key,
      rig: rigValue,
      jiraUrl: issue.url,
      summary: issue.summary,
      agent,
    });

    // Then start the workflow (spawns agent, creates worktree)
    await workflow.startWork({ ticketId: ticket.id, agent, jiraIssue: issue });

    // Reload to get updated ticket state from workflow
    tickets.reload();
  };

  const handleSendMessage = async (message: string) => {
    const ticket = currentTicket();
    if (ticket) await workflow.sendToAgent(ticket.id, message);
  };

  return (
    <Layout
      rig={rig() ?? null}
      showAll={props.showAll ?? false}
      notifications={notifications.notifications()}
      unreadCount={notifications.unreadCount()}
      hasBlocking={notifications.hasBlocking()}
      onQuit={() => renderer.destroy()}
      onAddTicket={() => setShowTicketInput(true)}
      onCloseTicket={() => {
        const ticket = currentTicket();
        if (!ticket) return;
        const idx = selection.selectedIndex();
        tickets.remove(ticket.id);
        // Adjust selection after removal
        const remaining = tickets.tickets().length;
        if (remaining === 0) {
          selection.clear();
        } else if (idx >= remaining) {
          selection.select(remaining - 1);
        }
      }}
      onOpenInJira={() => {
        const url = currentTicket()?.jira_url;
        if (url) console.log("Opening Jira:", url);
      }}
      onEscalate={() => console.log("Escalate", currentTicket()?.id)}
      onSwitchAgent={() => {
        const t = currentTicket();
        if (t) {
          const newAgent = t.agent === "opencode" ? "claude" : "opencode";
          tickets.update(t.id, { agent: newAgent });
        }
      }}
      sidebar={
        <TicketSidebar
          tickets={tickets.tickets}
          selectedIndex={selection.selectedIndex()}
          width={SIDEBAR_WIDTH}
          onSelect={(i) => selection.select(i)}
          onNew={() => setShowTicketInput(true)}
        />
      }
      overlays={
        <TicketInput
          isOpen={showTicketInput()}
          onClose={() => setShowTicketInput(false)}
          onSubmit={handleTicketSubmit}
          fetchIssue={atlassian.fetchIssue}
          defaultAgent={config.config()?.defaults.agent}
        />
      }
    >
      <box flexGrow={1} padding={spacing.sm}>
        <Show when={loading()}>
          <text fg={theme().text.dim}>Loading...</text>
        </Show>
        <Show when={!loading() && currentTicket()} keyed>
          {(ticket: Ticket) => (
            <TicketPane
              ticket={ticket}
              agentState={workflow.getAgentState(ticket.id)}
              events={[]}
              onEscalate={() => console.log("Escalate", ticket.id)}
              onSwitchAgent={(agent) => tickets.update(ticket.id, { agent })}
              onOpenJira={() => {
                if (ticket.jira_url) console.log("Opening", ticket.jira_url);
              }}
              onClose={() => tickets.remove(ticket.id)}
              onSendMessage={handleSendMessage}
            />
          )}
        </Show>
        <Show when={!loading() && !currentTicket()}>
          <EmptyState showAll={props.showAll ?? false} rig={rig() ?? null} />
        </Show>
      </box>
    </Layout>
  );
}
