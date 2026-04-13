/**
 * TicketActionsContext - Shares ticket action handlers across components
 *
 * Eliminates prop drilling by providing action handlers via context.
 * Wraps useTicketActions composable for consumption by child components.
 */

import { createContext, useContext, type JSX } from "solid-js";
import type { AgentType } from "#types/config.ts";

export interface TicketActions {
  onEscalate?: () => void;
  onSwitchAgent?: (agent: AgentType) => void;
  onOpenJira?: () => void;
  onClose?: () => void;
  onSendMessage?: (message: string) => void;
  onStop?: () => void;
  onStart?: () => void;
}

const TicketActionsContext = createContext<TicketActions>({});

export function TicketActionsProvider(props: { children: JSX.Element; actions: TicketActions }) {
  return (
    <TicketActionsContext.Provider value={props.actions}>
      {props.children}
    </TicketActionsContext.Provider>
  );
}

export function useTicketActionsContext(): TicketActions {
  return useContext(TicketActionsContext) ?? {};
}
