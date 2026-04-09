/**
 * useTmux hook - Reactive wrapper for tmux session management
 *
 * Provides Solid.js reactive state management for tmux sessions.
 */

import { createSignal, onMount } from "solid-js";
import type { TmuxSession } from "../../harness/session/tmux/index.ts";
import {
  createSession as tmuxCreate,
  killSession as tmuxKill,
  listSessions as tmuxList,
  sessionExists as tmuxExists,
  sendKeys as tmuxSendKeys,
  capturePane as tmuxCapture,
  isTmuxAvailable,
} from "../../harness/session/tmux/index.ts";
import type { UseTmuxOptions, UseTmuxReturn } from "./types.ts";

/**
 * Hook for managing tmux sessions with reactive state
 *
 * @example
 * ```tsx
 * function SessionList() {
 *   const tmux = useTmux({ autoLoad: true });
 *
 *   return (
 *     <For each={tmux.sessions()}>
 *       {(session) => (
 *         <box>
 *           <text>{session.name}</text>
 *           <button onPress={() => tmux.kill(session.ticketId)}>Kill</button>
 *         </box>
 *       )}
 *     </For>
 *   );
 * }
 * ```
 */
export function useTmux(options: UseTmuxOptions = {}): UseTmuxReturn {
  const [sessions, setSessions] = createSignal<TmuxSession[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);

  const handleError = (err: unknown): Error => {
    const e = err instanceof Error ? err : new Error(String(err));
    setError(e);
    options.onError?.(e);
    return e;
  };

  const reload = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      const loaded = await tmuxList();
      setSessions(loaded);
      options.onChange?.(loaded);
    } catch (err) {
      handleError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const create = async (
    ticketId: string,
    workdir: string
  ): Promise<TmuxSession | null> => {
    try {
      setError(null);
      const session = await tmuxCreate(ticketId, workdir);
      if (session) {
        await reload();
      }
      return session;
    } catch (err) {
      handleError(err);
      return null;
    }
  };

  const kill = async (ticketId: string): Promise<boolean> => {
    try {
      setError(null);
      const result = await tmuxKill(ticketId);
      if (result) {
        await reload();
      }
      return result;
    } catch (err) {
      handleError(err);
      return false;
    }
  };

  const exists = async (ticketId: string): Promise<boolean> => {
    try {
      setError(null);
      return await tmuxExists(ticketId);
    } catch (err) {
      handleError(err);
      return false;
    }
  };

  const sendKeys = async (
    ticketId: string,
    keys: string,
    enter: boolean = true
  ): Promise<boolean> => {
    try {
      setError(null);
      return await tmuxSendKeys(ticketId, keys, enter);
    } catch (err) {
      handleError(err);
      return false;
    }
  };

  const capture = async (ticketId: string): Promise<string | null> => {
    try {
      setError(null);
      return await tmuxCapture(ticketId);
    } catch (err) {
      handleError(err);
      return null;
    }
  };

  const isAvailable = async (): Promise<boolean> => {
    try {
      return await isTmuxAvailable();
    } catch {
      return false;
    }
  };

  // Auto-load if requested
  if (options.autoLoad) {
    onMount(() => {
      reload().catch(() => {
        // Error handled in reload
      });
    });
  }

  return {
    sessions,
    isLoading,
    error,
    reload,
    create,
    kill,
    exists,
    sendKeys,
    capture,
    isAvailable,
  };
}
