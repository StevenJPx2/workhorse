/** Text buffer management for streaming activity items. */

import type { ActivityItem } from "../primitives/activity-types.ts";

const MAX_ITEMS = 100;

const textBuffers = new Map<string, string>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

export interface ActivityState {
  items: ActivityItem[];
  isStreaming: boolean;
  lastActivity: Date | null;
}

export type UpdateStateFn = (
  issueId: string,
  updater: (prev: ActivityState) => ActivityState,
) => void;

export type AddItemFn = (issueId: string, item: ActivityItem) => void;

/** Append text delta to the buffer for an issue. */
export function appendTextBuffer(issueId: string, delta: string): void {
  textBuffers.set(issueId, (textBuffers.get(issueId) ?? "") + delta);
}

/** Get the current text buffer for an issue. */
export function getTextBuffer(issueId: string): string {
  return textBuffers.get(issueId) ?? "";
}

/** Clear the text buffer for an issue. */
export function clearTextBuffer(issueId: string): void {
  textBuffers.set(issueId, "");
}

/** Schedule a flush callback for an issue. */
export function scheduleFlush(issueId: string, callback: () => void): void {
  const existing = flushTimers.get(issueId);
  if (existing) clearTimeout(existing);
  flushTimers.set(issueId, setTimeout(callback, 500));
}

/** Flush accumulated text as a text bubble. */
export function flushTextBuffer(
  issueId: string,
  updateState: UpdateStateFn,
): void {
  const timer = flushTimers.get(issueId);
  if (timer) {
    clearTimeout(timer);
    flushTimers.delete(issueId);
  }

  const buffer = textBuffers.get(issueId) ?? "";
  if (buffer.trim()) {
    updateState(issueId, (prev) => {
      const items = [...prev.items];
      const lastItem = items[items.length - 1];

      if (lastItem && lastItem.type === "text") {
        items[items.length - 1] = {
          ...lastItem,
          content: lastItem.content + buffer.trimEnd(),
          timestamp: new Date(),
        };
      } else {
        items.push({
          type: "text",
          content: buffer.trim(),
          timestamp: new Date(),
        });
        if (items.length > MAX_ITEMS) {
          items.splice(0, items.length - MAX_ITEMS);
        }
      }

      return { ...prev, items, lastActivity: new Date() };
    });
    textBuffers.set(issueId, "");
  }
}

/** Clear all state for an issue. */
export function clearTextBuffers(issueId: string): void {
  textBuffers.delete(issueId);
  const timer = flushTimers.get(issueId);
  if (timer) clearTimeout(timer);
  flushTimers.delete(issueId);
}
