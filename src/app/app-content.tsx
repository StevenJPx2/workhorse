/**
 * AppContent component - Main dashboard content
 *
 * Contains the core app logic including rig detection, workflow,
 * and rendering of the Layout with TicketPane.
 */

import { createSignal, createEffect, Show } from "solid-js";
import { useRenderer } from "@opentui/solid";
import { Layout } from "./layout.tsx";
import { EmptyState } from "./empty-state.tsx";
import { TicketPane } from "../components/ticket-pane/index.ts";
import { TicketInput } from "../components/ticket-input/index.ts";
import { initDatabase } from "../lib/db.ts";
import { detectRig, type RigInfo } from "../lib/detect-rig.ts";
import { spacing, useTheme } from "../lib/theme/index.ts";
import { TicketsProvider, useTicketsContext } from "../lib/tickets-context.tsx";
import { WorkflowProvider, useWorkflowContext } from "../lib/workflow-context.tsx";
import { useModalSystem } from "../hooks/use-modal-system/index.ts";
import { useConfig, useAtlassian } from "../hooks/index.ts";
import type { AgentType } from "../types/config.ts";
import type { Ticket } from "../types/ticket.ts";
import type { JiraIssue } from "../hooks/use-atlassian/index.ts";

export interface AppContentProps {
  showAll?: boolean;
}

/**
 * Main app content with data loading and layout
 */
export function AppContent(props: AppContentProps) {
  const renderer = useRenderer();
  const [rigInfo, setRigInfo] = createSignal<RigInfo | null>(null);
  const [loading, setLoading] = createSignal(true);

  const config = useConfig({ autoLoad: true });
  const cloudId = () => config.config()?.jira.cloud_id;
  const rig = () => rigInfo()?.rig ?? undefined;
  const gitRoot = () => rigInfo()?.gitRoot;

  const atlassian = useAtlassian({ cloudId, autoConnect: false });

  // Initial load effect
  createEffect(() => {
    (async () => {
      try {
        initDatabase();
        const info = await detectRig();
        if (info) setRigInfo(info);
      } finally {
        setLoading(false);
      }
    })();
  });

  return (
    <WorkflowProvider
      repoPath={gitRoot}
      jiraCloudId={cloudId}
      onError={(err) => console.error("Workflow error:", err)}
    >
      <TicketsProvider rig={rig} autoLoad={!loading()}>
        <AppContentInner
          showAll={props.showAll}
          rig={rig()}
          loading={loading()}
          atlassian={atlassian}
          config={config}
          onQuit={() => renderer.destroy()}
        />
      </TicketsProvider>
    </WorkflowProvider>
  );
}

interface AppContentInnerProps {
  showAll?: boolean;
  rig: string | undefined;
  loading: boolean;
  atlassian: ReturnType<typeof useAtlassian>;
  config: ReturnType<typeof useConfig>;
  onQuit: () => void | Promise<void>;
}

/**
 * Inner content that has access to all contexts
 */
function AppContentInner(props: AppContentInnerProps) {
  const { theme } = useTheme();
  const modals = useModalSystem();
  const workflow = useWorkflowContext();
  const { currentTicket, actions } = useTicketsContext();

  // Reload tickets when loading completes
  createEffect(() => {
    if (!props.loading) {
      actions.reload();
    }
  });

  const handleTicketSubmit = async (key: string, agent: AgentType, issue: JiraIssue) => {
    const rigValue = props.rig;
    if (!rigValue) {
      console.error("Cannot add ticket: no rig detected");
      return;
    }

    const ticket = actions.create({
      jiraKey: key,
      rig: rigValue,
      jiraUrl: issue.url,
      summary: issue.summary,
      agent,
    });

    await workflow.startWork({ ticketId: ticket.id, agent, jiraIssue: issue });
    actions.reload();
  };

  const handleSendMessage = async (message: string) => {
    const ticket = currentTicket();
    if (ticket) await workflow.sendToAgent(ticket.id, message);
  };

  return (
    <>
      <Layout rig={props.rig ?? null} showAll={props.showAll ?? false} onQuit={props.onQuit}>
        <box flexGrow={1} padding={spacing.sm}>
          <Show when={props.loading}>
            <text fg={theme().text.dim}>Loading...</text>
          </Show>
          <Show when={!props.loading && currentTicket()} keyed>
            {(ticket: Ticket) => (
              <TicketPane
                ticket={ticket}
                agentState={() => workflow.getAgentState(ticket.id)}
                events={[]}
                onEscalate={() => console.log("Escalate", ticket.id)}
                onSwitchAgent={(agent) => actions.update(ticket.id, { agent })}
                onOpenJira={() => {
                  if (ticket.jira_url) console.log("Opening", ticket.jira_url);
                }}
                onClose={() => actions.remove(ticket.id)}
                onSendMessage={handleSendMessage}
              />
            )}
          </Show>
          <Show when={!props.loading && !currentTicket()}>
            <EmptyState showAll={props.showAll ?? false} rig={props.rig ?? null} />
          </Show>
        </box>
      </Layout>

      {/* TicketInput modal - controlled by ModalSystem */}
      <TicketInput
        isOpen={modals.isOpen("ticket-input")}
        onClose={() => modals.close("ticket-input")}
        onSubmit={handleTicketSubmit}
        fetchIssue={props.atlassian.fetchIssue}
        defaultAgent={props.config.config()?.defaults.agent}
      />
    </>
  );
}
