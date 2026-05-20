/**
 * Hook subscriptions for activity store.
 * Handles agent events and updates the activity store accordingly.
 */

import type { HookEmitter, Notification } from "workhorse-core";

import type { ActivityItem } from "../primitives/activity-types.ts";
import { showError } from "./ui-toast.ts";

const MAX_ITEMS = 100;

/** Text buffers per issue for accumulating streaming text */
const textBuffers = new Map<string, string>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

interface ActivityState {
  items: ActivityItem[];
  isStreaming: boolean;
  lastActivity: Date | null;
}

type UpdateStateFn = (issueId: string, updater: (prev: ActivityState) => ActivityState) => void;
type AddItemFn = (issueId: string, item: ActivityItem) => void;

/**
 * Flush accumulated text as a text bubble.
 * If the last item is already a text item, appends to it instead of creating a new one.
 */
function flushText(issueId: string, updateState: UpdateStateFn) {
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
        items.push({ type: "text", content: buffer.trim(), timestamp: new Date() });
        if (items.length > MAX_ITEMS) {
          items.splice(0, items.length - MAX_ITEMS);
        }
      }

      return { ...prev, items, lastActivity: new Date() };
    });
    textBuffers.set(issueId, "");
  }
}

/** Subscribe to hooks and update activity store */
export function subscribeActivityHooks(
  hooks: HookEmitter,
  updateState: UpdateStateFn,
  addItem: AddItemFn,
) {
  const flush = (issueId: string) => flushText(issueId, updateState);

  hooks.on("agent.output", ({ issueId, delta }: { issueId: string; delta: string }) => {
    textBuffers.set(issueId, (textBuffers.get(issueId) ?? "") + delta);
    const currentBuffer = textBuffers.get(issueId) ?? "";

    updateState(issueId, (prev) => {
      const items = [...prev.items];
      const lastItem = items[items.length - 1];

      if (lastItem && lastItem.type === "text") {
        items[items.length - 1] = {
          ...lastItem,
          content: lastItem.content.trimEnd() + currentBuffer,
          timestamp: new Date(),
        };
        textBuffers.set(issueId, "");
      } else if (currentBuffer.trim()) {
        items.push({ type: "text", content: currentBuffer.trim(), timestamp: new Date() });
        textBuffers.set(issueId, "");
        if (items.length > MAX_ITEMS) {
          items.splice(0, items.length - MAX_ITEMS);
        }
      }

      return { ...prev, items, isStreaming: true, lastActivity: new Date() };
    });

    const existing = flushTimers.get(issueId);
    if (existing) clearTimeout(existing);
    flushTimers.set(
      issueId,
      setTimeout(() => flush(issueId), 500),
    );
  });

  hooks.on(
    "agent.tool_call",
    ({ issueId, tool, args }: { issueId: string; tool: string; args: unknown }) => {
      flush(issueId);
      addItem(issueId, { type: "tool", tool, args, timestamp: new Date() });
    },
  );

  hooks.on("agent.idle", ({ issueId }: { issueId: string }) => {
    flush(issueId);
    updateState(issueId, (prev) => ({ ...prev, isStreaming: false }));
    addItem(issueId, { type: "idle", timestamp: new Date() });
  });

  hooks.on("agent.stop.post", ({ adapter }: { adapter: { issue: { id: string } } }) => {
    flush(adapter.issue.id);
    updateState(adapter.issue.id, (prev) => ({ ...prev, isStreaming: false }));
  });

  hooks.on("steering.reminder", ({ issueId, reminder }: { issueId: string; reminder: string }) => {
    flush(issueId);
    addItem(issueId, { type: "steering", reminder, timestamp: new Date() });
  });

  hooks.on("user.message", ({ issueId, content }: { issueId: string; content: string }) => {
    flush(issueId);
    addItem(issueId, { type: "user_message", content, timestamp: new Date() });
  });

  hooks.on(
    "notification.created",
    ({ notification, issueId }: { notification: Notification; issueId: string }) => {
      flush(issueId);
      addItem(issueId, { type: "notification", notification, timestamp: new Date() });
    },
  );

  hooks.on(
    "memory.indexed",
    (p: { issueId: string; documentCount: number; trigger: "idle" | "stop" }) => {
      addItem(p.issueId, {
        type: "memory",
        documentCount: p.documentCount,
        trigger: p.trigger,
        timestamp: new Date(),
      });
    },
  );

  hooks.on(
    "monitor.error",
    ({
      id,
      error,
      errorCount,
    }: {
      id: string;
      issueId: string;
      error: Error;
      errorCount: number;
    }) => {
      showError(`Monitor "${id}" error (${errorCount}/5): ${error.message}`);
    },
  );
}

/** Clear text buffers for an issue */
export function clearTextBuffers(issueId: string) {
  textBuffers.delete(issueId);
  const timer = flushTimers.get(issueId);
  if (timer) clearTimeout(timer);
  flushTimers.delete(issueId);
}
