import { createSignal, onCleanup } from "solid-js";
import { insertTicketEvent, getTicketEvents } from "../../lib/db/events.ts";
import type { TicketEvent } from "../../types/ticket.ts";
import type {
  UseEventLogOptions,
  UseEventLogReturn,
  EventLogEntry,
  EventLogAction,
  LogStatusChangeParams,
  LogFileModifiedParams,
  LogTestResultParams,
  LogAgentStartedParams,
  LogCommentParams,
} from "./types.ts";

function parseEvent(event: TicketEvent): EventLogEntry {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(event.payload);
  } catch {
    payload = { raw: event.payload };
  }

  return {
    id: event.id,
    ticketId: event.ticket_id,
    eventType: event.event_type as EventLogAction,
    payload,
    timestamp: event.timestamp,
  };
}

function resolveTicketId(ticketId?: string | (() => string | undefined)): string | undefined {
  if (typeof ticketId === "function") return ticketId();
  return ticketId;
}

export function useEventLog(options: UseEventLogOptions = {}): UseEventLogReturn {
  const [events, setEvents] = createSignal<EventLogEntry[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);

  const maxEvents = () => options.maxEvents ?? 50;

  const currentTicketId = () => resolveTicketId(options.ticketId);

  function reload(): void {
    const tid = currentTicketId();
    if (!tid) return;

    try {
      setIsLoading(true);
      setError(null);
      const raw = getTicketEvents(tid);
      const parsed = raw.map(parseEvent);
      setEvents(parsed.slice(0, maxEvents()));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }

  function logEvent(type: EventLogAction, payload: Record<string, unknown>): EventLogEntry {
    const tid = currentTicketId();
    if (!tid) {
      throw new Error("No ticket ID set for event log");
    }

    const result = insertTicketEvent({
      ticket_id: tid,
      event_type: type,
      payload,
    });

    const entry: EventLogEntry = {
      id: result.id,
      ticketId: result.ticket_id,
      eventType: type,
      payload,
      timestamp: result.timestamp,
    };

    setEvents((prev) => [entry, ...prev].slice(0, maxEvents()));
    return entry;
  }

  function logStatusChange(params: LogStatusChangeParams): EventLogEntry {
    return logEvent("status_change", {
      from: params.from,
      to: params.to,
    });
  }

  function logFileModified(params: LogFileModifiedParams): EventLogEntry {
    return logEvent("file_modified", {
      path: params.path,
      additions: params.additions,
      deletions: params.deletions,
    });
  }

  function logTestResult(params: LogTestResultParams): EventLogEntry {
    return logEvent("test_result", {
      passed: params.passed,
      failed: params.failed,
      total: params.total,
    });
  }

  function logAgentStarted(params: LogAgentStartedParams): EventLogEntry {
    return logEvent("agent_started", {
      agent: params.agent,
      worktreePath: params.worktreePath,
    });
  }

  function logAgentStopped(params: Record<string, unknown>): EventLogEntry {
    return logEvent("agent_stopped", params);
  }

  function logAgentCrashed(params: Record<string, unknown>): EventLogEntry {
    return logEvent("agent_crashed", params);
  }

  function logComment(params: LogCommentParams): EventLogEntry {
    return logEvent("comment", {
      source: params.source,
      content: params.content,
    });
  }

  function logEscalation(questions: string[]): EventLogEntry {
    return logEvent("escalation", {
      questions,
    });
  }

  function getEventsByType(type: EventLogAction): EventLogEntry[] {
    return events().filter((e) => e.eventType === type);
  }

  function getRecentEvents(count: number): EventLogEntry[] {
    return events().slice(0, count);
  }

  const count = () => events().length;

  if (options.autoLoad && currentTicketId()) {
    reload();
  }

  if (options.pollInterval && options.pollInterval > 0) {
    const timer = setInterval(reload, options.pollInterval);
    onCleanup(() => clearInterval(timer));
  }

  return {
    events,
    isLoading,
    error,
    count,
    logStatusChange,
    logFileModified,
    logTestResult,
    logAgentStarted,
    logAgentStopped,
    logAgentCrashed,
    logComment,
    logEscalation,
    logCustom: logEvent,
    reload,
    getEventsByType,
    getRecentEvents,
  };
}
