/**
 * FileChanges component - Displays files modified by the agent
 *
 * Extracts file_modified events from EventLogEntry[] or TicketEvent[]
 * and renders a compact list of changed files with add/delete stats.
 */

import { For, Show, createMemo } from "solid-js";
import { useTheme } from "../../theme/index.ts";
import type { EventLogEntry } from "../../hooks/use-event-log/types.ts";
import type { TicketEvent } from "#types/ticket.ts";

export interface FileChangeEntry {
  path: string;
  additions: number;
  deletions: number;
  timestamp: string;
}

export interface FileChangesProps {
  /** EventLogEntry from useEventLog (preferred) */
  logEntries?: EventLogEntry[];
  /** Raw TicketEvent[] from database (fallback) */
  events?: TicketEvent[];
  /** Max files to display (default: 10) */
  maxFiles?: number;
}

function extractFromLogEntries(entries: EventLogEntry[]): FileChangeEntry[] {
  return entries
    .filter((e) => e.eventType === "file_modified")
    .map((e) => ({
      path: String(e.payload.path ?? ""),
      additions: Number(e.payload.additions ?? 0),
      deletions: Number(e.payload.deletions ?? 0),
      timestamp: e.timestamp,
    }));
}

function extractFromRawEvents(events: TicketEvent[]): FileChangeEntry[] {
  const result: FileChangeEntry[] = [];
  for (const event of events) {
    if (event.event_type !== "file_modified") continue;
    try {
      const payload = JSON.parse(event.payload);
      result.push({
        path: String(payload.path ?? ""),
        additions: Number(payload.additions ?? 0),
        deletions: Number(payload.deletions ?? 0),
        timestamp: event.timestamp,
      });
    } catch {
      // Skip malformed payloads
    }
  }
  return result;
}

function formatChangeCount(additions: number, deletions: number): string {
  const parts: string[] = [];
  if (additions > 0) parts.push(`+${additions}`);
  if (deletions > 0) parts.push(`-${deletions}`);
  return parts.length > 0 ? parts.join(" ") : "modified";
}

function shortPath(path: string, maxLen: number = 40): string {
  if (path.length <= maxLen) return path;
  const parts = path.split("/");
  if (parts.length <= 2) return path.slice(-maxLen);
  const first = parts[0];
  const last = parts[parts.length - 1];
  const result = `${first}/.../${last}`;
  return result.length <= maxLen ? result : last.slice(-maxLen);
}

export function FileChanges(props: FileChangesProps) {
  const { theme } = useTheme();

  const maxFiles = () => props.maxFiles ?? 10;

  const fileChanges = createMemo(() => {
    let changes: FileChangeEntry[];

    if (props.logEntries && props.logEntries.length > 0) {
      changes = extractFromLogEntries(props.logEntries);
    } else if (props.events && props.events.length > 0) {
      changes = extractFromRawEvents(props.events);
    } else {
      return [];
    }

    const seen = new Map<string, FileChangeEntry>();
    for (const change of changes) {
      const existing = seen.get(change.path);
      if (existing) {
        existing.additions += change.additions;
        existing.deletions += change.deletions;
      } else {
        seen.set(change.path, { ...change });
      }
    }

    return Array.from(seen.values()).slice(0, maxFiles());
  });

  const totalAdditions = () => fileChanges().reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = () => fileChanges().reduce((sum, f) => sum + f.deletions, 0);

  return (
    <Show when={fileChanges().length > 0}>
      <box
        flexDirection="column"
        border
        borderStyle="rounded"
        borderColor={theme().border.default}
        padding={1}
      >
        <text fg={theme().text.secondary}>Files ({fileChanges().length})</text>
        <box height={1} />

        <For each={fileChanges()}>
          {(change) => (
            <box flexDirection="row" height={1}>
              <text fg={theme().text.dim}>{"  "}</text>
              <text fg={theme().text.primary}>{shortPath(change.path)} </text>
              <text fg={change.additions > 0 ? theme().success : theme().text.dim}>
                {formatChangeCount(change.additions, change.deletions)}
              </text>
            </box>
          )}
        </For>

        <Show when={fileChanges().length > 1}>
          <box height={1} />
          <text fg={theme().text.dim}>
            {totalAdditions() > 0 && `+${totalAdditions()}`}
            {totalAdditions() > 0 && totalDeletions() > 0 && " "}
            {totalDeletions() > 0 && `-${totalDeletions()}`}
            {" across "}
            {fileChanges().length} file{fileChanges().length !== 1 ? "s" : ""}
          </text>
        </Show>
      </box>
    </Show>
  );
}
