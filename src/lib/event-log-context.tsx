/**
 * EventLogContext - Provides event logging for the current ticket
 *
 * Wraps useEventLog hook into a context to avoid prop drilling
 * the event log instance through multiple component layers.
 * Automatically tracks the selected ticket and provides logEntries
 * for the TicketPane.
 */

import {
  createContext,
  useContext,
  type JSX,
  type Accessor,
} from "solid-js";
import {
  useEventLog,
  type UseEventLogReturn,
} from "../hooks/use-event-log/index.ts";
import { useTicketsContext } from "./tickets-context.tsx";

export interface EventLogContextValue {
  /** Event log for the currently selected ticket */
  eventLog: UseEventLogReturn;
  /** Reactively track the current ticket ID for the event log */
  currentTicketId: Accessor<string | undefined>;
}

const EventLogContext = createContext<EventLogContextValue>();

export interface EventLogProviderProps {
  children: JSX.Element;
}

/**
 * Provider that creates an event log bound to the current ticket.
 * When the selected ticket changes, reloads events for that ticket.
 */
export function EventLogProvider(props: EventLogProviderProps) {
  const { currentTicket } = useTicketsContext();

  const eventLog = useEventLog({
    ticketId: () => currentTicket()?.id,
    autoLoad: true,
    pollInterval: 3000,
  });

  const contextValue: EventLogContextValue = {
    eventLog,
    currentTicketId: () => currentTicket()?.id,
  };

  return (
    <EventLogContext.Provider value={contextValue}>
      {props.children}
    </EventLogContext.Provider>
  );
}

/**
 * Hook to consume the EventLogContext.
 *
 * @throws Error if used outside of EventLogProvider
 */
export function useEventLogContext(): EventLogContextValue {
  const context = useContext(EventLogContext);
  if (!context) {
    throw new Error(
      "useEventLogContext must be used within an EventLogProvider"
    );
  }
  return context;
}

/**
 * Standalone hook that returns event log entries for the current ticket.
 * Useful when you only need the entries and not the full context.
 */
export function useCurrentTicketEvents(): Accessor<
  UseEventLogReturn["events"] extends Accessor<infer T> ? T : never
> {
  const { eventLog } = useEventLogContext();
  return eventLog.events;
}