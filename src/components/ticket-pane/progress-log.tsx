/**
 * ProgressLog component - Displays ticket events as a progress log
 *
 * Accepts either raw TicketEvent[] from the database or
 * EventLogEntry[] from useEventLog hook.
 */

import { For, Show, createMemo } from "solid-js";
import { useTheme } from "../../lib/theme/index.ts";
import type { TicketEvent } from "../../types/ticket.ts";
import type { EventLogAction } from "../../hooks/use-event-log/types.ts";
import type { ProgressLogProps, FormattedEvent } from "./types.ts";

const EVENT_ICONS: Record<string, string> = {
  status_change: "*",
  file_modified: "~",
  test_result: "T",
  escalation: "!",
  comment: "#",
  agent_started: ">",
  agent_stopped: ".",
  agent_crashed: "!!",
  jira_sync: "@",
  notification: "^",
};

function getEventIcon(eventType: string, isLatest: boolean): string {
  if (isLatest) return ">";
  return EVENT_ICONS[eventType] ?? "-";
}

function formatPayload(
  eventType: string,
  payload: Record<string, unknown>
): string {
  switch (eventType) {
    case "status_change":
      return `Status: ${payload.from} -> ${payload.to}`;
    case "file_modified":
      return `Modified: ${payload.path}`;
    case "test_result":
      return `Tests: ${payload.passed}/${payload.total} passed`;
    case "escalation":
      return `Escalated: ${(payload.questions as string[])?.length ?? 0} questions`;
    case "comment": {
      const content = String(payload.content ?? "").slice(0, 40);
      return `[${payload.source}] ${content}${(payload.content as string)?.length > 40 ? "..." : ""}`;
    }
    case "agent_started":
      return `Agent started: ${payload.agent}`;
    case "agent_stopped":
      return "Agent stopped";
    case "agent_crashed":
      return `Agent crashed: ${payload.reason ?? "unknown"}`;
    case "jira_sync":
      return `Jira sync: ${payload.action ?? "synced"}`;
    case "notification":
      return String(payload.content ?? "notification");
    default:
      return eventType;
  }
}

function formatRawEvent(event: TicketEvent, isLatest: boolean): FormattedEvent {
  const icon = getEventIcon(event.event_type, isLatest);
  let description = "";

  try {
    const payload = JSON.parse(event.payload);
    description = formatPayload(event.event_type, payload);
  } catch {
    description = event.event_type;
  }

  return {
    icon,
    description,
    timestamp: event.timestamp,
    isCurrent: isLatest,
  };
}

function formatLogEntry(
  entry: { eventType: EventLogAction; payload: Record<string, unknown>; timestamp: string },
  isLatest: boolean
): FormattedEvent {
  return {
    icon: getEventIcon(entry.eventType, isLatest),
    description: formatPayload(entry.eventType, entry.payload),
    timestamp: entry.timestamp,
    isCurrent: isLatest,
  };
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function ProgressLog(props: ProgressLogProps) {
  const { theme } = useTheme();

  const maxEvents = () => props.maxEvents ?? 10;

  const formattedEvents = createMemo(() => {
    if (props.logEntries && props.logEntries.length > 0) {
      return props.logEntries
        .slice(0, maxEvents())
        .map((entry, i) => formatLogEntry(entry, i === 0));
    }

    const events = props.events ?? [];
    return events
      .slice(0, maxEvents())
      .map((event, i) => formatRawEvent(event, i === 0));
  });

  return (
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={theme().border.default}
      padding={1}
    >
      <text fg={theme().text.secondary}>Progress</text>
      <box height={1} />

      <Show
        when={formattedEvents().length > 0}
        fallback={<text fg={theme().text.dim}>No events yet</text>}
      >
        <For each={formattedEvents()}>
          {(event) => (
            <box flexDirection="row" height={1}>
              <text
                fg={event.isCurrent ? theme().primary : theme().text.dim}
              >
                {event.icon}{" "}
              </text>
              <text
                fg={event.isCurrent ? theme().text.primary : theme().text.secondary}
              >
                {event.description}
              </text>
              <Show when={props.showTimestamps && event.timestamp}>
                <text fg={theme().text.dim}>
                  {" "}
                  {formatTime(event.timestamp)}
                </text>
              </Show>
            </box>
          )}
        </For>
      </Show>
    </box>
  );
}