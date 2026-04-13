/**
 * TicketsContext - Provides tickets and selection state to the component tree
 *
 * Wraps useTickets and useSelection hooks into a single context to avoid
 * prop drilling ticket state through multiple component layers.
 *
 * @example
 * ```tsx
 * // Wrap app content
 * <TicketsProvider rig={rig}>
 *   <App />
 * </TicketsProvider>
 *
 * // Consume in any descendant
 * function TicketList() {
 *   const { tickets, selection, actions } = useTicketsContext();
 *   return <For each={tickets()}>{(t) => ...}</For>;
 * }
 * ```
 */

import { createContext, useContext, type JSX, type Accessor } from "solid-js";
import {
  useTickets,
  useSelection,
  type UseSelectionReturn,
  type CreateTicketInput,
  type UpdateTicketInput,
} from "../hooks/index.ts";
import type { Ticket } from "../types/ticket.ts";

/**
 * Combined context value providing tickets, selection, and convenience actions
 */
export interface TicketsContextValue {
  /** Current list of tickets (reactive) */
  tickets: Accessor<Ticket[]>;
  /** Loading state (reactive) */
  isLoading: Accessor<boolean>;
  /** Selection hook return values */
  selection: UseSelectionReturn<Ticket>;
  /** The currently selected ticket (convenience accessor) */
  currentTicket: Accessor<Ticket | undefined>;
  /** Ticket CRUD actions */
  actions: {
    /** Reload tickets from database */
    reload: () => void;
    /** Get a single ticket by ID */
    get: (id: string) => Ticket | null;
    /** Create a new ticket */
    create: (input: CreateTicketInput) => Ticket;
    /** Update a ticket */
    update: (id: string, input: UpdateTicketInput) => void;
    /** Remove a ticket and adjust selection */
    remove: (id: string) => void;
  };
}

/**
 * Props for the TicketsProvider component
 */
export interface TicketsProviderProps {
  /** Filter tickets by rig (git remote URL) - reactive */
  rig: Accessor<string | undefined>;
  /** Whether to auto-load tickets on mount */
  autoLoad?: boolean;
  /** Children components */
  children: JSX.Element;
}

const TicketsContext = createContext<TicketsContextValue>();

/**
 * Provider component that sets up tickets and selection state
 */
/** Default poll interval to refresh tickets (5 seconds) */
const DEFAULT_POLL_INTERVAL = 5000;

export function TicketsProvider(props: TicketsProviderProps) {
  // Initialize tickets hook with rig filter and polling
  const ticketsHook = useTickets({
    rig: props.rig,
    autoLoad: props.autoLoad ?? false,
    pollInterval: DEFAULT_POLL_INTERVAL,
  });

  // Initialize selection hook tied to tickets list
  const selection = useSelection<Ticket>({
    items: ticketsHook.tickets,
    wrap: true,
    initialIndex: 0,
  });

  // Convenience accessor for current ticket
  const currentTicket = () => selection.selectedItem();

  // Actions with integrated selection management
  const actions: TicketsContextValue["actions"] = {
    reload: ticketsHook.reload,
    get: ticketsHook.get,
    create: ticketsHook.create,

    update: (id: string, input: UpdateTicketInput) => {
      ticketsHook.update(id, input);
    },

    remove: (id: string) => {
      const idx = selection.selectedIndex();
      ticketsHook.remove(id);

      // Adjust selection after removal
      const remaining = ticketsHook.tickets().length;
      if (remaining === 0) {
        selection.clear();
      } else if (idx >= remaining) {
        selection.select(remaining - 1);
      }
    },
  };

  const contextValue: TicketsContextValue = {
    tickets: ticketsHook.tickets,
    isLoading: ticketsHook.isLoading,
    selection,
    currentTicket,
    actions,
  };

  return <TicketsContext.Provider value={contextValue}>{props.children}</TicketsContext.Provider>;
}

/**
 * Hook to consume the TicketsContext
 *
 * @throws Error if used outside of TicketsProvider
 */
export function useTicketsContext(): TicketsContextValue {
  const context = useContext(TicketsContext);
  if (!context) {
    throw new Error("useTicketsContext must be used within a TicketsProvider");
  }
  return context;
}
