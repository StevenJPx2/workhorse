/**
 * TicketPane component - Main ticket detail view
 *
 * Displays comprehensive ticket information including:
 * - Header with ID and summary
 * - Status, agent, and worktree metadata
 * - Progress log of events
 * - Action bar
 * - Optional chat input for agent feedback
 *
 * @example
 * <TicketPane
 *   ticket={selectedTicket()}
 *   events={ticketEvents()}
 *   onEscalate={() => ...}
 *   onOpenJira={() => ...}
 * />
 */

import { Show } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import { useTheme, spacing } from "../../lib/theme/index.ts";
import { useNavigation } from "../../lib/navigation-context.ts";
import { useKeyboardContext } from "../../lib/keyboard-context.ts";
import { ChatBox, useChatBox } from "../chat-box/index.ts";
import { TicketHeader } from "./ticket-header.tsx";
import { TicketMeta } from "./ticket-meta.tsx";
import { ProgressLog } from "./progress-log.tsx";
import { TicketActions } from "./ticket-actions.tsx";
import type { TicketPaneProps } from "./types.ts";

/**
 * Main ticket detail pane
 */
export function TicketPane(props: TicketPaneProps) {
  const { theme } = useTheme();
  const navigation = useNavigation();
  const keyboard = useKeyboardContext();

  const chatInputId = () => `chat-${props.ticket.id}`;

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
  // Note: e, o, x are handled globally in Layout.tsx to avoid double-firing
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

      {/* Progress log */}
      <Show when={events().length > 0}>
        <ProgressLog events={events()} maxEvents={8} />
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
        onChange={chat.setValue}
        onSubmit={() => chat.submit()}
        onExit={() => {
          chatLock?.release();
          chatLock = undefined;
        }}
        placeholder="Press 'i' to send feedback to agent..."
      />
    </box>
  );
}
