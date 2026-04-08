/**
 * ProgressLog component - Displays ticket events as a progress log
 */

import { For, Show, createMemo } from "solid-js";
import { useTheme } from "../../lib/theme/index.ts";
import type { TicketEvent, TicketEventType } from "../../types/ticket.ts";
import type { ProgressLogProps, FormattedEvent } from "./types.ts";

/**
 * Get icon for event type
 */
function getEventIcon(eventType: TicketEventType, isLatest: boolean): string {
  if (isLatest) return ">";
  switch (eventType) {
    case "status_change":
      return "*";
    case "file_modified":
      return "~";
    case "test_result":
      return "T";
    case "escalation":
      return "!";
    case "comment":
      return "#";
    default:
      return "-";
  }
}

/**
 * Format event for display
 */
function formatEvent(
  event: TicketEvent,
  isLatest: boolean
): FormattedEvent {
  const icon = getEventIcon(event.event_type as TicketEventType, isLatest);
  let description = "";

  try {
    const payload = JSON.parse(event.payload);

    switch (event.event_type) {
      case "status_change":
        description = `Status: ${payload.from} -> ${payload.to}`;
        break;
      case "file_modified":
        description = `Modified: ${payload.path}`;
        break;
      case "test_result":
        description = `Tests: ${payload.passed}/${payload.total} passed`;
        break;
      case "escalation":
        description = `Escalated: ${payload.questions?.length ?? 0} questions`;
        break;
      case "comment":
        description = `[${payload.source}] ${payload.content?.slice(0, 40)}...`;
        break;
      default:
        description = event.event_type;
    }
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

/**
 * Progress log showing ticket events
 */
export function ProgressLog(props: ProgressLogProps) {
  const { theme } = useTheme();

  const maxEvents = () => props.maxEvents ?? 10;

  const formattedEvents = createMemo(() => {
    const events = props.events.slice(0, maxEvents());
    return events.map((event, index) => formatEvent(event, index === 0));
  });

  return (
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={theme().border.default}
      padding={1}
    >
      {/* Header */}
      <text fg={theme().text.secondary}>Progress</text>
      <box height={1} />

      {/* Events list */}
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
            </box>
          )}
        </For>
      </Show>
    </box>
  );
}
