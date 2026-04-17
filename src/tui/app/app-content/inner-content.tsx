/**
 * Inner content component that has access to all contexts
 */

import { createEffect, createMemo, Show } from "solid-js";
import { spacing, useTheme } from "../../theme/index.ts";
import { useTicketsContext } from "../../contexts/tickets-context.tsx";
import { useWorkflowContext } from "../../contexts/workflow-context.tsx";
import { useEventLogContext } from "../../contexts/event-log-context.tsx";
import { TicketActionsProvider } from "../../contexts/ticket-actions-context.tsx";
import { useNotifications, useGitHub } from "../../hooks/index.ts";
import { usePRReview } from "../../hooks/use-pr-review/index.ts";
import { useModalSystem } from "../../hooks/use-modal-system/index.ts";
import { TicketInput } from "../../components/ticket-input/index.ts";
import { Layout } from "../layout.tsx";
import { EmptyState } from "../empty-state.tsx";
import { useTicketActions } from "../use-ticket-actions.ts";
import { useJiraTicketPickup } from "../use-jira-ticket-pickup.ts";
import { TicketPaneWithLayoutContext } from "./ticket-pane-wrapper.tsx";
import type { AppContentInnerProps } from "./types.ts";
import type { AgentType } from "#types/config.ts";
import type { JiraIssue } from "../../hooks/use-atlassian/index.ts";

/**
 * Inner content that has access to all contexts
 */
export function InnerContent(props: AppContentInnerProps) {
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

  // GitHub connection for PR review
  const github = useGitHub({ autoConnect: false });

  // Parse PR info from URL when ticket has a PR
  const prInfo = createMemo(() => {
    const ticket = currentTicket();
    if (!ticket?.pr_url) return null;
    // Parse: https://github.com/owner/repo/pull/123
    const match = ticket.pr_url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2], prNumber: parseInt(match[3], 10) };
  });

  // Connect to GitHub when we have a PR to review (including on resume)
  createEffect(() => {
    const info = prInfo();
    if (info && !github.isConnected() && !github.isConnecting()) {
      github.connect().catch(() => {
        // Error is captured in github.error()
      });
    }
  });

  // PR review hook - only active when we have PR info and GitHub is connected
  const prReview = createMemo(() => {
    const info = prInfo();
    if (!info || !github.isConnected()) return undefined;

    return usePRReview(
      {
        owner: info.owner,
        repo: info.repo,
        prNumber: info.prNumber,
        autoStart: true,
      },
      {
        listReviews: github.listReviews,
        listReviewComments: github.listReviewComments,
        createReviewComment: github.createReviewComment,
        createReview: github.createReview,
        updateTicketStatus: async () => {
          // Status updates handled by workflow
        },
        logEvent: () => {
          // Event logging handled elsewhere
        },
      },
    );
  });

  // Reload tickets when loading completes
  createEffect(() => {
    if (!props.loading) {
      actions.reload();
    }
  });

  // Hook for Jira ticket pickup (assign + transition)
  const { onTicketPickup } = useJiraTicketPickup({ atlassian: props.atlassian });

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

    // Start agent work and update Jira in parallel
    await Promise.all([
      workflow.startWork({ ticketId: ticket.id, agent, jiraIssue: issue }),
      onTicketPickup(key),
    ]);
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
              <TicketPaneWithLayoutContext
                ticket={currentTicket()!}
                fallbackAgentState={() => workflow.getAgentState(currentTicket()!.id)}
                logEntries={eventLog.events()}
                prReview={prReview()}
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
