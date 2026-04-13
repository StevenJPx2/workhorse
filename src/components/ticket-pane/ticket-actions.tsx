/**
 * TicketActions component - Action bar for ticket operations
 */

import { ActionBar } from "../button/index.ts";
import { useTicketActionsContext } from "../../lib/ticket-actions-context.tsx";
import type { TicketActionsProps } from "./types.ts";

/**
 * Action bar with ticket operations
 */
export function TicketActions(props: TicketActionsProps) {
  const actions = useTicketActionsContext();

  // Resolve agent state
  const resolvedAgentState = () => {
    const state = props.agentState;
    return typeof state === "function" ? state() : state;
  };

  const isAgentRunning = () => {
    const state = resolvedAgentState();
    return state === "running" || state === "starting";
  };

  const actionItems = () => {
    const base = [
      { key: "e", action: "escalate", handler: actions.onEscalate },
      { key: "a", action: "switch agent", handler: props.onSwitchAgent },
      { key: "o", action: "open jira", handler: actions.onOpenJira },
      { key: "x", action: "close", handler: actions.onClose },
    ];

    // Add start/stop action based on agent state
    if (isAgentRunning() && actions.onStop) {
      return [{ key: "s", action: "stop", handler: actions.onStop }, ...base];
    } else if (!isAgentRunning() && actions.onStart) {
      return [{ key: "s", action: "start", handler: actions.onStart }, ...base];
    }

    return base;
  };

  return <ActionBar actions={actionItems()} />;
}
