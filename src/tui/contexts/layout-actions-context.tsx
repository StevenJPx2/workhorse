/**
 * LayoutActionsContext - Provides layout action state to the app
 *
 * Exposes agent starting state and getAgentState function so components
 * like TicketPane can show immediate feedback when user presses 's'.
 */

import { createContext, useContext, type JSX, type Accessor } from "solid-js";

export interface LayoutActionsContextValue {
  /** Get agent state, accounting for starting state */
  getAgentState: (ticketId: string) => string | undefined;
  /** Whether any agent is currently starting */
  isAgentStarting: Accessor<boolean>;
}

const LayoutActionsContext = createContext<LayoutActionsContextValue | undefined>();

export interface LayoutActionsProviderProps {
  children: JSX.Element;
  value: LayoutActionsContextValue;
}

export function LayoutActionsProvider(props: LayoutActionsProviderProps) {
  return (
    <LayoutActionsContext.Provider value={props.value}>
      {props.children}
    </LayoutActionsContext.Provider>
  );
}

export function useLayoutActionsContext(): LayoutActionsContextValue {
  const context = useContext(LayoutActionsContext);
  if (!context) {
    throw new Error("useLayoutActionsContext must be used within a LayoutActionsProvider");
  }
  return context;
}

/**
 * Optional hook that returns undefined if not in a provider
 * Useful for components that can work with or without the context
 */
export function useLayoutActionsContextOptional(): LayoutActionsContextValue | undefined {
  return useContext(LayoutActionsContext);
}
