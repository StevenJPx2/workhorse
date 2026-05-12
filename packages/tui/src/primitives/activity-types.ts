/**
 * Activity item type definitions for the activity feed.
 *
 * Uses a simplified discriminated union where tools and notifications
 * are single generic variants. Rendering logic is handled by the
 * plugin-based renderer registry.
 */

import type { Notification } from "@stevenjpx2/jiratown-core";

/** Activity item types */
export type ActivityItem =
  | { type: "text"; content: string; timestamp: Date }
  | { type: "tool"; tool: string; args: unknown; timestamp: Date }
  | { type: "notification"; notification: Notification; timestamp: Date }
  | { type: "steering"; reminder: string; timestamp: Date }
  | { type: "idle"; timestamp: Date }
  | { type: "user_message"; content: string; timestamp: Date };
