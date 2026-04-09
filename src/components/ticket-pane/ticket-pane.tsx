/**
 * TicketPane component - Main ticket detail view
 *
 * Displays comprehensive ticket information including:
 * - Header with ID and summary
 * - Status, agent, and worktree metadata
 * - Agent display with LLM-summarized activity
 * - Progress log of events
 * - Action bar
 * - Optional chat input for agent feedback
 */

import { Show } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import { useTheme, spacing } from "../../lib/theme/index.ts";
import { useNavigation } from "../../lib/navigation-context.ts";
import { useKeyboardContext } from "../../lib/keyboard-context.ts";
import { useAgentProgress } from "../../hooks/use-agent-progress/index.ts";
import { useAgentSummary } from "../../hooks/use-agent-summary/index.ts";
import { ChatBox, useChatBox } from "../chat-box/index.ts";
import { TicketHeader } from "./ticket-header.tsx";
import { TicketMeta } from "./ticket-meta.tsx";
import { ProgressLog } from "./progress-log.tsx";
import { TicketActions } from "./ticket-actions.tsx";
import { AgentDisplay } from "./agent-display.tsx";
import type { TicketPaneProps } from "./types.ts";

/**
 * Main ticket detail pane
 */
export function TicketPane(props: TicketPaneProps) {
  useTheme(); // Ensure theme is loaded
  const navigation = useNavigation();
  const keyboard = useKeyboardContext();

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

  // Get agent status via SDK (connects to agent's OpenCode port)
  const agentSummary = useAgentSummary({
    ticketId: () => props.ticket.id,
    worktreePath: () => props.ticket.worktree_path ?? undefined,
    enabled: () => Boolean(props.ticket.worktree_path),
    pollInterval: 3000,
  });

  // Chat box state for agent feedback
  const chat = useChatBox({
    onSubmit: (message) => {
      props.onSendMessage?.(message);
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
      case "s":
        // Clear agent summary cache to force fresh data after toggle
        agentSummary.invalidate();
        break;
    }
  });

  const events = () => props.events ?? [];
  const showAgent = () => props.ticket.worktree_path || resolvedAgentState();

  return (
    <box flexDirection="column" gap={spacing.sm} flexGrow={1} padding={spacing.sm}>
      {/* Header - ID and summary */}
      <TicketHeader id={props.ticket.id} summary={props.ticket.summary} />

      {/* Metadata - Status, Agent, Worktree */}
      <TicketMeta
        status={props.ticket.status}
        agent={props.ticket.agent}
        agentState={props.agentState}
        worktreePath={props.ticket.worktree_path}
        branchName={props.ticket.branch_name}
      />

      {/* Progress log (only if has events and agent not active) */}
      <Show when={events().length > 0 && !isAgentActive()}>
        <ProgressLog events={events()} maxEvents={5} />
      </Show>

      {/* Agent display - state header + LLM-summarized activity */}
      <Show when={showAgent()}>
        <AgentDisplay
          progress={agentProgress.progress}
          steps={agentSummary.steps}
          currentStatus={agentSummary.currentStatus}
          isPolling={agentSummary.isPolling}
          error={agentSummary.error}
          maxSteps={8}
          onStop={props.onStop}
        />
      </Show>

      {/* Spacer */}
      <box flexGrow={1} />

      {/* Actions bar */}
      <TicketActions
        onEscalate={props.onEscalate}
        onSwitchAgent={() => props.onSwitchAgent?.(props.ticket.agent === "opencode" ? "claude" : "opencode")}
        onOpenJira={props.onOpenJira}
        onClose={props.onClose}
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
