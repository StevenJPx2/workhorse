/** Hook subscriptions for activity store - handles agent events and updates activity store. */

import type { HookEmitter, Notification } from "workhorse-core";

import { showError } from "./ui/toast.ts";
import {
  appendTextBuffer,
  clearTextBuffer,
  flushTextBuffer,
  getTextBuffer,
  scheduleFlush,
  type AddItemFn,
  type UpdateStateFn,
} from "./activity-text-buffer.ts";

/** Subscribe to hooks and update activity store */
export function subscribeActivityHooks(
  hooks: HookEmitter,
  updateState: UpdateStateFn,
  addItem: AddItemFn,
) {
  const flush = (issueId: string) => flushTextBuffer(issueId, updateState);

  hooks.on(
    "agent.output",
    ({ issueId, delta }: { issueId: string; delta: string }) => {
      appendTextBuffer(issueId, delta);
      const currentBuffer = getTextBuffer(issueId);

      updateState(issueId, (prev) => {
        const items = [...prev.items];
        const lastItem = items[items.length - 1];

        if (lastItem && lastItem.type === "text") {
          items[items.length - 1] = {
            ...lastItem,
            content: lastItem.content.trimEnd() + currentBuffer,
            timestamp: new Date(),
          };
          clearTextBuffer(issueId);
        } else if (currentBuffer.trim()) {
          items.push({
            type: "text",
            content: currentBuffer.trim(),
            timestamp: new Date(),
          });
          clearTextBuffer(issueId);
        }

        return { ...prev, items, isStreaming: true, lastActivity: new Date() };
      });

      scheduleFlush(issueId, () => flush(issueId));
    },
  );

  hooks.on(
    "agent.tool_call",
    ({
      issueId,
      tool,
      args,
    }: {
      issueId: string;
      tool: string;
      args: unknown;
    }) => {
      flush(issueId);
      addItem(issueId, { type: "tool", tool, args, timestamp: new Date() });
    },
  );

  hooks.on("agent.idle", ({ issueId }: { issueId: string }) => {
    flush(issueId);
    updateState(issueId, (prev) => ({ ...prev, isStreaming: false }));
    addItem(issueId, { type: "idle", timestamp: new Date() });
  });

  hooks.on(
    "agent.stop.post",
    ({ adapter }: { adapter: { issue: { id: string } } }) => {
      flush(adapter.issue.id);
      updateState(adapter.issue.id, (prev) => ({
        ...prev,
        isStreaming: false,
      }));
    },
  );

  hooks.on(
    "steering.reminder",
    ({ issueId, reminder }: { issueId: string; reminder: string }) => {
      flush(issueId);
      addItem(issueId, { type: "steering", reminder, timestamp: new Date() });
    },
  );

  hooks.on(
    "user.message",
    ({ issueId, content }: { issueId: string; content: string }) => {
      flush(issueId);
      addItem(issueId, {
        type: "user_message",
        content,
        timestamp: new Date(),
      });
    },
  );

  hooks.on(
    "notification.created",
    ({
      notification,
      issueId,
    }: {
      notification: Notification;
      issueId: string;
    }) => {
      flush(issueId);
      addItem(issueId, {
        type: "notification",
        notification,
        timestamp: new Date(),
      });
    },
  );

  hooks.on(
    "memory.indexed",
    (p: {
      issueId: string;
      documentCount: number;
      trigger: "idle" | "stop";
    }) => {
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
