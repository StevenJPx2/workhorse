/**
 * Event formatter for OpenCode SDK events
 *
 * Transforms SDK events into displayable StreamMessage objects.
 */

import type { OpenCodeEvent } from "../../harness/orchestrator/opencode-client/types.ts";
import type { StreamMessage } from "./types.ts";

/**
 * Generate a unique ID for messages
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * SDK Part types we care about
 */
interface TextPart {
  type: "text";
  text: string;
}

interface ToolPart {
  type: "tool-invocation" | "tool-result";
  name?: string;
  state?: string;
}

interface StepPart {
  type: "step-start" | "step-finish";
  name?: string;
}

type Part = TextPart | ToolPart | StepPart | { type: string };

/**
 * Format message.part.updated event
 */
function formatPartUpdated(
  props: { part?: Part; delta?: string },
  timestamp: string,
): StreamMessage | null {
  const { part, delta } = props;

  // Use delta if available (streaming text)
  if (delta && typeof delta === "string") {
    return { id: generateId(), timestamp, content: delta, type: "assistant" };
  }

  if (!part) return null;

  // TextPart
  if (part.type === "text" && "text" in part) {
    const textPart = part as TextPart;
    if (textPart.text) {
      return { id: generateId(), timestamp, content: textPart.text, type: "assistant" };
    }
  }

  // Tool invocations
  if (part.type === "tool-invocation" || part.type === "tool-result") {
    const toolPart = part as ToolPart;
    const name = toolPart.name ?? "tool";
    const state = toolPart.state ?? part.type;
    return { id: generateId(), timestamp, content: `[${name}] ${state}`, type: "tool" };
  }

  // Step start/finish
  if (part.type === "step-start" || part.type === "step-finish") {
    const stepPart = part as StepPart;
    return {
      id: generateId(),
      timestamp,
      content: `${part.type}: ${stepPart.name ?? "step"}`,
      type: "system",
    };
  }

  return null;
}

/**
 * Format an OpenCode event into a StreamMessage
 */
export function formatEvent(event: OpenCodeEvent): StreamMessage | null {
  const timestamp = new Date().toISOString();

  switch (event.type) {
    case "message.part.updated":
      return formatPartUpdated(event.properties as { part?: Part; delta?: string }, timestamp);

    case "message.updated": {
      const props = event.properties as { info?: { role?: string; summary?: { raw?: string } } };
      if (props.info?.summary?.raw) {
        return {
          id: generateId(),
          timestamp,
          content: props.info.summary.raw,
          type: props.info.role === "assistant" ? "assistant" : "system",
        };
      }
      return null;
    }

    case "session.status": {
      const props = event.properties as { status?: { type?: string; message?: string } };
      if (props.status?.message) {
        return {
          id: generateId(),
          timestamp,
          content: `[${props.status.type ?? "status"}] ${props.status.message}`,
          type: "system",
        };
      }
      return null;
    }

    case "file.edited": {
      const props = event.properties as { file?: string };
      if (props.file) {
        return { id: generateId(), timestamp, content: `File edited: ${props.file}`, type: "tool" };
      }
      return null;
    }

    case "file.watcher.updated": {
      const props = event.properties as { file?: string; event?: string };
      if (props.file) {
        return {
          id: generateId(),
          timestamp,
          content: `File ${props.event ?? "changed"}: ${props.file}`,
          type: "tool",
        };
      }
      return null;
    }

    case "todo.updated": {
      const props = event.properties as { todos?: Array<{ content: string; status: string }> };
      if (props.todos?.length) {
        const inProgress = props.todos.find((t) => t.status === "in_progress");
        if (inProgress) {
          return {
            id: generateId(),
            timestamp,
            content: `Working on: ${inProgress.content}`,
            type: "system",
          };
        }
      }
      return null;
    }

    default:
      return null;
  }
}
