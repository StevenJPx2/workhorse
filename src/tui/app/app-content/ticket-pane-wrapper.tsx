/**
 * Wrapper component that uses layout actions context to get immediate "starting" state
 * This component is rendered inside Layout, so it has access to the LayoutActionsContext
 */

import { useLayoutActionsContextOptional } from "../../contexts/layout-actions-context.tsx";
import { TicketPane, type TicketPaneProps } from "../../components/ticket-pane/index.ts";
import type { AgentState } from "#core/agent/orchestrator/types.ts";

/** Props for TicketPaneWithLayoutContext */
export interface TicketPaneWithLayoutContextProps extends Omit<TicketPaneProps, "agentState"> {
  /** Fallback agent state getter (used if context not available) */
  fallbackAgentState: () => string | undefined;
}

/**
 * Wrapper that provides immediate agent state from context
 */
export function TicketPaneWithLayoutContext(props: TicketPaneWithLayoutContextProps) {
  const layoutActions = useLayoutActionsContextOptional();

  // Use context's getAgentState if available (shows "starting" immediately),
  // otherwise fall back to workflow state
  const agentState = (): AgentState | undefined => {
    if (layoutActions) {
      return layoutActions.getAgentState(props.ticket.id) as AgentState | undefined;
    }
    return props.fallbackAgentState() as AgentState | undefined;
  };

  return (
    <TicketPane
      ticket={props.ticket}
      agentState={agentState}
      logEntries={props.logEntries}
      prReview={props.prReview}
      blockingNotifications={props.blockingNotifications}
      onResume={props.onResume}
      onViewJira={props.onViewJira}
      onCancel={props.onCancel}
      onHandoff={props.onHandoff}
    />
  );
}
