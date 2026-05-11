/**
 * Global activity store - persists agent activity across navigation.
 * Keyed by issueId, stores activity items and streaming state.
 */

import { createSignal } from "solid-js";
import type { HookEmitter, Notification } from "@jiratown/core";
import type { ActivityItem } from "../primitives/activity-types.ts";

export interface ActivityState {
  items: ActivityItem[];
  isStreaming: boolean;
  lastActivity: Date | null;
}

const MAX_ITEMS = 100;

/** Global store of activity state per issue */
const activityMap = new Map<string, ActivityState>();

/** Text buffers per issue for accumulating streaming text */
const textBuffers = new Map<string, string>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Reactive signal that triggers re-renders when activity changes */
const [version, setVersion] = createSignal(0);

/** Get activity state for an issue (creates if doesn't exist) */
export function getActivityState(issueId: string): ActivityState {
  // Access version to make this reactive
  version();

  if (!activityMap.has(issueId)) {
    activityMap.set(issueId, {
      items: [],
      isStreaming: false,
      lastActivity: null,
    });
  }
  return activityMap.get(issueId)!;
}

/** Update activity state for an issue */
function updateState(issueId: string, updater: (prev: ActivityState) => ActivityState) {
  activityMap.set(issueId, updater(getActivityState(issueId)));
  setVersion((v) => v + 1);
}

/** Add an activity item for an issue */
function addItem(issueId: string, item: ActivityItem) {
  updateState(issueId, (prev) => {
    const items = [...prev.items, item];
    if (items.length > MAX_ITEMS) {
      items.splice(0, items.length - MAX_ITEMS);
    }
    return { ...prev, items, lastActivity: item.timestamp };
  });
}

/** Flush accumulated text as a text bubble */
function flushText(issueId: string) {
  const timer = flushTimers.get(issueId);
  if (timer) {
    clearTimeout(timer);
    flushTimers.delete(issueId);
  }

  const buffer = textBuffers.get(issueId) ?? "";
  if (buffer.trim()) {
    addItem(issueId, { type: "text", content: buffer.trim(), timestamp: new Date() });
    textBuffers.set(issueId, "");
  }
}

/** Initialize activity store with hook subscriptions */
export function initActivityStore(hooks: HookEmitter) {
  // Handle text output - buffer and flush on pause or tool call
  hooks.on("agent.output", ({ issueId, delta }: { issueId: string; delta: string }) => {
    updateState(issueId, (prev) => ({ ...prev, isStreaming: true }));

    textBuffers.set(issueId, (textBuffers.get(issueId) ?? "") + delta);

    // Reset flush timer
    const existing = flushTimers.get(issueId);
    if (existing) clearTimeout(existing);
    flushTimers.set(
      issueId,
      setTimeout(() => flushText(issueId), 500),
    );
  });

  // Handle tool calls - flush text first, then add tool (simplified variant)
  hooks.on(
    "agent.tool_call",
    ({ issueId, tool, args }: { issueId: string; tool: string; args: unknown }) => {
      flushText(issueId);
      addItem(issueId, { type: "tool", tool, args, timestamp: new Date() });
    },
  );

  // Handle agent idle
  hooks.on("agent.idle", ({ issueId }: { issueId: string }) => {
    flushText(issueId);
    updateState(issueId, (prev) => ({ ...prev, isStreaming: false }));
    addItem(issueId, { type: "idle", timestamp: new Date() });
  });

  // Handle steering reminders
  hooks.on("steering.reminder", ({ issueId, reminder }: { issueId: string; reminder: string }) => {
    flushText(issueId);
    addItem(issueId, { type: "steering", reminder, timestamp: new Date() });
  });

  // Handle notifications - add to activity feed
  hooks.on(
    "notification.created",
    ({ notification, issueId }: { notification: Notification; issueId: string }) => {
      flushText(issueId);
      addItem(issueId, { type: "notification", notification, timestamp: new Date() });
    },
  );
}

/** Clear activity for an issue (e.g., when agent is removed) */
export function clearActivity(issueId: string) {
  activityMap.delete(issueId);
  textBuffers.delete(issueId);
  const timer = flushTimers.get(issueId);
  if (timer) clearTimeout(timer);
  flushTimers.delete(issueId);
  setVersion((v) => v + 1);
}
