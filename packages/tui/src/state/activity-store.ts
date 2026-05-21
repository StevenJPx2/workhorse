/**
 * Global activity store - persists agent activity across navigation.
 * Keyed by issueId, stores activity items and streaming state.
 */

import { createSignal } from "solid-js";
import type { HookEmitter } from "workhorse-core";

import type { ActivityItem } from "../primitives/activity-types.ts";
import { subscribeActivityHooks } from "./activity-hooks.ts";
import { clearTextBuffers } from "./activity-text-buffer.ts";

export interface ActivityState {
  items: ActivityItem[];
  isStreaming: boolean;
  lastActivity: Date | null;
}

const MAX_ITEMS = 100;

/** Global store of activity state per issue */
const activityMap = new Map<string, ActivityState>();

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
function updateState(
  issueId: string,
  updater: (prev: ActivityState) => ActivityState,
) {
  activityMap.set(issueId, updater(getActivityState(issueId)));
  setVersion((v) => v + 1);
}

/** Initialize activity store with hook subscriptions */
export function initActivityStore(hooks: HookEmitter) {
  subscribeActivityHooks(hooks, updateState, (issueId, item) => {
    updateState(issueId, (prev) => {
      const items = [...prev.items, item];
      if (items.length > MAX_ITEMS) {
        items.splice(0, items.length - MAX_ITEMS);
      }
      return { ...prev, items, lastActivity: item.timestamp };
    });
  });
}

/** Clear activity for an issue (e.g., when agent is removed) */
export function clearActivity(issueId: string) {
  activityMap.delete(issueId);
  clearTextBuffers(issueId);
  setVersion((v) => v + 1);
}
