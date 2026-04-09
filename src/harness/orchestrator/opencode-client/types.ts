/**
 * OpenCode SDK types
 */

/**
 * OpenCode health status
 */
export interface OpenCodeHealth {
  healthy: boolean;
  version?: string;
  error?: string;
}

/**
 * OpenCode session status - matches SDK's SessionStatus type
 */
export type OpenCodeSessionStatus =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number }
  | { type: "offline"; error: string };

/**
 * Event types from OpenCode
 */
export type OpenCodeEventType =
  | "session.created"
  | "session.updated"
  | "session.deleted"
  | "session.status"
  | "message.created"
  | "message.updated"
  | "message.removed"
  | "message.part.updated"
  | "file.changed"
  | "permission.requested"
  | "unknown";

/**
 * OpenCode event
 */
export interface OpenCodeEvent {
  type: OpenCodeEventType;
  properties: Record<string, unknown>;
}

/**
 * Event subscription handle
 */
export interface EventSubscription {
  unsubscribe: () => void;
}