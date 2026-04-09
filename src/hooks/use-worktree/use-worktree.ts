/**
 * useWorktree hook - Reactive wrapper for git worktree management
 *
 * Provides Solid.js reactive state management for git worktrees.
 */

import { createSignal, onMount } from "solid-js";
import type { Worktree } from "../../harness/session/worktree/index.ts";
import {
  createWorktree as gitCreate,
  removeWorktree as gitRemove,
  listWorktrees as gitList,
  worktreeExists as gitExists,
  getWorktree as gitGet,
} from "../../harness/session/worktree/index.ts";
import type { UseWorktreeOptions, UseWorktreeReturn } from "./types.ts";

/**
 * Hook for managing git worktrees with reactive state
 *
 * @example
 * ```tsx
 * function WorktreeList() {
 *   const wt = useWorktree({
 *     repoPath: '/path/to/repo',
 *     autoLoad: true,
 *   });
 *
 *   const handleCreate = async () => {
 *     const worktree = await wt.create('AM-123', 'Story');
 *     console.log('Created:', worktree?.path);
 *   };
 *
 *   return (
 *     <For each={wt.worktrees()}>
 *       {(wt) => <text>{wt.branch}</text>}
 *     </For>
 *   );
 * }
 * ```
 */
export function useWorktree(options: UseWorktreeOptions = {}): UseWorktreeReturn {
  const [worktrees, setWorktrees] = createSignal<Worktree[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);

  const getRepoPath = (): string => {
    if (!options.repoPath) {
      throw new Error("repoPath is required for worktree operations");
    }
    return options.repoPath;
  };

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

      const repoPath = getRepoPath();
      const loaded = await gitList(repoPath);
      setWorktrees(loaded);
      options.onChange?.(loaded);
    } catch (err) {
      handleError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const create = async (
    ticketId: string,
    issueType?: string,
    baseBranch?: string
  ): Promise<Worktree | null> => {
    try {
      setError(null);
      const repoPath = getRepoPath();
      const worktree = await gitCreate(repoPath, ticketId, issueType, baseBranch);
      if (worktree) {
        await reload();
      }
      return worktree;
    } catch (err) {
      handleError(err);
      return null;
    }
  };

  const remove = async (
    ticketId: string,
    deleteBranch: boolean = false
  ): Promise<boolean> => {
    try {
      setError(null);
      const repoPath = getRepoPath();
      const result = await gitRemove(repoPath, ticketId, deleteBranch);
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
      const repoPath = getRepoPath();
      return await gitExists(repoPath, ticketId);
    } catch (err) {
      handleError(err);
      return false;
    }
  };

  const get = async (ticketId: string): Promise<Worktree | null> => {
    try {
      setError(null);
      const repoPath = getRepoPath();
      return await gitGet(repoPath, ticketId);
    } catch (err) {
      handleError(err);
      return null;
    }
  };

  // Auto-load if requested and repoPath is available
  if (options.autoLoad && options.repoPath) {
    onMount(() => {
      reload().catch(() => {
        // Error handled in reload
      });
    });
  }

  return {
    worktrees,
    isLoading,
    error,
    reload,
    create,
    remove,
    exists,
    get,
  };
}
