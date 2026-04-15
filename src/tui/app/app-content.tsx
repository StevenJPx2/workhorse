/** AppContent component - Main dashboard content with rig detection, workflow, and Layout rendering */
import { createSignal, createEffect, Show } from "solid-js";
import { useRenderer } from "@opentui/solid";
import { Layout } from "./layout.tsx";
import { EmptyState } from "./empty-state.tsx";
import { TicketPane } from "../components/ticket-pane/index.ts";
import { TicketInput } from "../components/ticket-input/index.ts";
import { initDatabase } from "#core/db/index.ts";
import { detectRig, type RigInfo } from "#core/git/detect-rig.ts";
import { spacing, useTheme } from "../theme/index.ts";
import { TicketsProvider, useTicketsContext } from "../contexts/tickets-context.tsx";
import { WorkflowProvider, useWorkflowContext } from "../contexts/workflow-context.tsx";
import { EventLogProvider, useEventLogContext } from "../contexts/event-log-context.tsx";
import { TicketActionsProvider } from "../contexts/ticket-actions-context.tsx";
import { useModalSystem } from "../hooks/use-modal-system/index.ts";
import { useConfig, useAtlassian, useNotifications } from "../hooks/index.ts";
import type { AgentType } from "#types/config.ts";

import type { JiraIssue } from "../hooks/use-atlassian/index.ts";
import { useTicketActions } from "./use-ticket-actions.ts";

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
        <EventLogProvider>
          <InnerWithEventLog
            showAll={props.showAll}
            rig={rig()}
            loading={loading()}
            atlassian={atlassian}
            config={config}
            onQuit={() => renderer.destroy()}
          />
        </EventLogProvider>
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
function InnerWithEventLog(props: AppContentInnerProps) {
  const { theme } = useTheme();
  const modals = useModalSystem();
  const workflow = useWorkflowContext();
  const { currentTicket, actions } = useTicketsContext();
  const { eventLog } = useEventLogContext();

  // Get notifications for the current ticket
  const notifications = useNotifications({
    ticketId: () => currentTicket()?.id,
    autoLoad: true,
    pollInterval: 5000,
  });

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

  // Context for ticket actions hook
  const ticketActionsContext = {
    actions: { update: actions.update, remove: actions.remove },
    workflow: {
      sendToAgent: workflow.sendToAgent,
      stopWork: workflow.stopWork,
      restartAgent: workflow.restartAgent,
    },
    eventLog,
  };

  // Create ticket actions reactively - rebinds when ticket changes
  const ticketActions = () => {
    const ticket = currentTicket();
    if (!ticket) return null;
    return useTicketActions(ticket, ticketActionsContext);
  };

  const actionsValue = () => {
    const ta = ticketActions();
    if (!ta) return {};
    return {
      onStop: ta.onStop,
      onStart: ta.onStart,
      onEscalate: ta.onEscalate,
      onOpenJira: ta.onOpenJira,
      onClose: ta.onClose,
      onSendMessage: ta.onSendMessage,
    };
  };

  return (
    <>
      <Layout rig={props.rig ?? null} showAll={props.showAll ?? false} onQuit={props.onQuit}>
        <box flexGrow={1} padding={spacing.sm}>
          <Show when={props.loading}>
            <text fg={theme().text.dim}>Loading...</text>
          </Show>
          <Show when={!props.loading && currentTicket()}>
            <TicketActionsProvider actions={actionsValue()}>
              <TicketPane
                ticket={currentTicket()!}
                agentState={() => workflow.getAgentState(currentTicket()!.id)}
                logEntries={eventLog.events()}
                blockingNotifications={notifications.blockingNotifications()}
                onResume={ticketActions()?.onResume}
                onViewJira={ticketActions()?.onViewJira}
                onCancel={ticketActions()?.onCancel}
                onHandoff={ticketActions()?.onHandoff}
              />
            </TicketActionsProvider>
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
