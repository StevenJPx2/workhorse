/**
 * TicketPane component - Main ticket detail view
 *
 * Displays comprehensive ticket information including:
 * - Header with ID and summary
 * - Status, agent, and worktree metadata
 * - Agent display with LLM-summarized activity
 * - PR review view (when ticket is in_review with pr_url)
 * - Progress log of events
 * - Action bar
 * - Optional chat input for agent feedback
 */

import { Show } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import { useTheme, spacing } from "../../theme/index.ts";
import { useNavigation } from "../../contexts/navigation-context.ts";
import { useKeyboardContext } from "../../contexts/keyboard-context.ts";
import { useTicketActionsContext } from "../../contexts/ticket-actions-context.tsx";
import { useAgentProgress } from "../../hooks/use-agent-progress/index.ts";
import { ChatBox, useChatBox } from "../chat-box/index.ts";
import { PRReviewView } from "../pr-review-view/index.ts";
import { BlockedView } from "../blocked-view/index.ts";
import { TicketHeader } from "./ticket-header.tsx";
import { TicketMeta } from "./ticket-meta.tsx";
import { ProgressLog } from "./progress-log.tsx";
import { FileChanges } from "./file-changes.tsx";
import { TicketActions } from "./ticket-actions.tsx";
import { AgentDisplay } from "./agent-display.tsx";
import { useAgentActivity } from "./use-agent-activity.ts";
import type { TicketPaneProps } from "./types.ts";

/**
 * Main ticket detail pane
 */
export function TicketPane(props: TicketPaneProps) {
  useTheme(); // Ensure theme is loaded
  const navigation = useNavigation();
  const keyboard = useKeyboardContext();
  const actions = useTicketActionsContext();

  const chatInputId = () => `chat-${props.ticket.id}`;

  // Resolve agent state - supports both value and accessor
  const resolvedAgentState = () => {
    const state = props.agentState;
    return typeof state === "function" ? state() : state;
  };

  const isAgentActive = () => {
    const state = resolvedAgentState();
    return state === "running" || state === "starting";
  };

  // Track agent progress with session memory
  const agentProgress = useAgentProgress({
    ticketId: () => props.ticket.id,
    worktreePath: () => props.ticket.worktree_path,
    agentState: resolvedAgentState,
  });

  // Real-time streaming + polling fallback for agent activity
  const agentActivity = useAgentActivity({
    ticketId: props.ticket.id,
    worktreePath: () => props.ticket.worktree_path,
    isAgentActive,
  });

  // Chat box state for agent feedback
  const chat = useChatBox({
    onSubmit: (message) => {
      actions.onSendMessage?.(message);
      agentActivity.addUserMessage(message);
      chat.addMessage(`Sent to agent: ${message}`, "system");
    },
  });

  // Navigation lock for chat input
  let chatLock: ReturnType<typeof navigation.acquireLock> | undefined;

  // Keyboard shortcuts (only for TicketPane-specific actions)
  useKeyboard((key) => {
    // Don't process if navigation is locked by another component
    if (navigation.isLocked()) return;
    // Don't process if in input mode
    if (keyboard.isInputMode()) return;

    switch (key.name) {
      case "i":
        // Enter chat input mode
        keyboard.enterInputMode(chatInputId());
        chatLock = navigation.acquireLock(chatInputId());
        break;
    }
  });

  const events = () => props.events ?? [];
  const hasEvents = () =>
    (props.events && props.events.length > 0) || (props.logEntries && props.logEntries.length > 0);
  const showAgent = () => props.ticket.worktree_path || resolvedAgentState();
  const showPRReview = () =>
    props.ticket.status === "in_review" && props.ticket.pr_url !== null && props.prReview;
  const showBlocked = () =>
    props.ticket.status === "blocked" && props.blockingNotifications?.length;

  return (
    <box flexDirection="column" gap={spacing.sm} flexGrow={1} padding={spacing.sm}>
      {/* Header - ID, summary, and sync indicators */}
      <TicketHeader
        id={props.ticket.id}
        summary={props.ticket.summary}
        showGitHub={Boolean(props.ticket.pr_url)}
        showJira={Boolean(props.ticket.jira_url)}
        isGitHubPolling={props.prReview?.isPolling}
        isJiraPolling={props.isJiraSyncing}
      />

      {/* Metadata - Status, Agent, Worktree */}
      <TicketMeta
        status={props.ticket.status}
        agent={props.ticket.agent}
        agentState={props.agentState}
        worktreePath={props.ticket.worktree_path}
        branchName={props.ticket.branch_name}
      />

      {/* PR review view (when ticket is in_review with pr_url) */}
      <Show when={showPRReview()}>
        {(_: boolean) => <PRReviewView prUrl={props.ticket.pr_url!} prReview={props.prReview!} />}
      </Show>

      {/* Blocked view (when ticket is blocked with escalation) */}
      <Show when={showBlocked()}>
        <BlockedView
          ticketId={props.ticket.id}
          jiraUrl={props.ticket.jira_url}
          notifications={props.blockingNotifications ?? []}
          onResume={props.onResume}
          onViewJira={props.onViewJira}
          onCancel={props.onCancel}
          onHandoff={props.onHandoff}
        />
      </Show>

      {/* Progress log (only if has events and agent not active) */}
      <Show when={hasEvents() && !isAgentActive()}>
        <ProgressLog events={events()} logEntries={props.logEntries} maxEvents={5} showTimestamps />
      </Show>

      {/* File changes (when there are modified files) */}
      <Show when={hasEvents()}>
        <FileChanges events={events()} logEntries={props.logEntries} maxFiles={8} />
      </Show>

      {/* Agent display - state header + real-time/summarized activity */}
      <Show when={showAgent()}>
        <AgentDisplay
          progress={agentProgress.progress}
          steps={agentActivity.steps}
          currentStatus={agentActivity.currentStatus}
          isPolling={agentActivity.isMonitoring}
          error={agentActivity.error}
          maxSteps={8}
          onStop={actions.onStop}
        />
      </Show>

      {/* Spacer */}
      <box flexGrow={1} />

      {/* Actions bar */}
      <TicketActions
        onSwitchAgent={() =>
          actions.onSwitchAgent?.(props.ticket.agent === "opencode" ? "claude" : "opencode")
        }
        agentState={props.agentState}
      />

      {/* Chat input */}
      <ChatBox
        inputId={chatInputId()}
        value={chat.value()}
        setValue={chat.setValue}
        submit={chat.submit}
        exit={() => {
          chatLock?.release();
          chatLock = undefined;
        }}
        placeholder="Press 'i' to send feedback to agent..."
      />
    </box>
  );
}
