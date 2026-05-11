/**
 * Primitive for tracking agent activity (tool calls, file edits, text output).
 * Uses the global activity store for persistence across navigation.
 */

import { createMemo, type Accessor } from "solid-js";
import { getActivityState, type ActivityState } from "../state/activity-store.ts";

export interface CreateActivityOptions {
  issueId: Accessor<string | null | undefined>;
}

/**
 * Create reactive activity tracking for an agent.
 * Uses global store - activity persists across navigation.
 */
export function createActivity(options: CreateActivityOptions) {
  const { issueId } = options;

  return {
    // Create a reactive accessor that reads from the global store
    state: createMemo<ActivityState>(() => {
      const id = issueId();
      if (!id) {
        return { items: [], isStreaming: false, lastActivity: null };
      }
      return getActivityState(id);
    }),
  };
}
