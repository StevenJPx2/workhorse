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
 * Event types from OpenCode SDK
 * See: node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts
 */
export type OpenCodeEventType =
  | "session.created"
  | "session.updated"
  | "session.deleted"
  | "session.status"
  | "session.idle"
  | "session.compacted"
  | "session.diff"
  | "session.error"
  | "message.created"
  | "message.updated"
  | "message.removed"
  | "message.part.updated"
  | "message.part.removed"
  | "file.edited"
  | "file.watcher.updated"
  | "permission.updated"
  | "permission.replied"
  | "todo.updated"
  | "command.executed"
  | "lsp.client.diagnostics"
  | "lsp.updated"
  | "pty.created"
  | "pty.updated"
  | "pty.exited"
  | "pty.deleted"
  | "server.connected"
  | "server.instance.disposed"
  | "installation.updated"
  | "installation.update-available"
  | "vcs.branch.updated"
  | "tui.prompt.append"
  | "tui.command.execute"
  | "tui.toast.show"
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
