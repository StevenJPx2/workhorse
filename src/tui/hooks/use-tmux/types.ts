/**
 * Types for useTmux hook
 */

import type { Accessor } from "solid-js";
import type { TmuxSession } from "#core/session/tmux/index.ts";

/**
 * Options for useTmux hook
 */
export interface UseTmuxOptions {
  /** Whether to auto-load sessions on mount */
  autoLoad?: boolean;
  /** Callback when sessions change */
  onChange?: (sessions: TmuxSession[]) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

/**
 * Return value from useTmux hook
 */
export interface UseTmuxReturn {
  /** List of active Jiratown tmux sessions */
  sessions: Accessor<TmuxSession[]>;
  /** Loading state */
  isLoading: Accessor<boolean>;
  /** Last error if any */
  error: Accessor<Error | null>;
  /** Reload sessions from tmux */
  reload: () => Promise<void>;
  /** Create a new session */
  create: (ticketId: string, workdir: string) => Promise<TmuxSession | null>;
  /** Kill a session */
  kill: (ticketId: string) => Promise<boolean>;
  /** Check if session exists */
  exists: (ticketId: string) => Promise<boolean>;
  /** Send keys to a session */
  sendKeys: (ticketId: string, keys: string, enter?: boolean) => Promise<boolean>;
  /** Capture pane output */
  capture: (ticketId: string) => Promise<string | null>;
  /** Check if tmux is available on system */
  isAvailable: () => Promise<boolean>;
}
