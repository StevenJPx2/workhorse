/**
 * Primitive for tracking file changes in an agent's worktree.
 * Uses git diff --stat to get actual line counts.
 */

import { createSignal, onCleanup, createEffect, type Accessor } from "solid-js";
import { $ } from "bun";

export interface FileChange {
  path: string;
  additions: number;
  deletions: number;
}

export interface FileChangesState {
  files: FileChange[];
  totalAdditions: number;
  totalDeletions: number;
  loading: boolean;
  error: string | null;
}

export interface CreateFileChangesOptions {
  /** Path to the worktree directory */
  worktreePath: Accessor<string | null | undefined>;
  /** Poll interval in ms (default: 2000) */
  pollInterval?: number;
}

/**
 * Create reactive file changes tracking for a worktree.
 * Polls git diff --numstat to get line-level change stats.
 */
export function createFileChanges(options: CreateFileChangesOptions) {
  const { worktreePath, pollInterval = 2000 } = options;

  const [state, setState] = createSignal<FileChangesState>({
    files: [],
    totalAdditions: 0,
    totalDeletions: 0,
    loading: false,
    error: null,
  });

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  /** Fetch file changes from git */
  const fetchChanges = async () => {
    const path = worktreePath();
    if (!path) {
      setState({
        files: [],
        totalAdditions: 0,
        totalDeletions: 0,
        loading: false,
        error: null,
      });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // Use git diff --numstat to get additions/deletions per file
      // Compare against the merge-base with origin/main (or origin/master)
      const result =
        await $`cd ${path} && git diff --numstat $(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD origin/master 2>/dev/null || echo HEAD~10) 2>/dev/null`.text();

      const files: FileChange[] = [];
      let totalAdditions = 0;
      let totalDeletions = 0;

      for (const line of result.trim().split("\n")) {
        if (!line.trim()) continue;

        const parts = line.split("\t");
        const addStr = parts[0] ?? "0";
        const delStr = parts[1] ?? "0";
        const filePath = parts.slice(2).join("\t"); // Handle paths with tabs

        // Binary files show as "-" for additions/deletions
        const additions = addStr === "-" ? 0 : parseInt(addStr, 10) || 0;
        const deletions = delStr === "-" ? 0 : parseInt(delStr, 10) || 0;

        if (filePath) {
          files.push({ path: filePath, additions, deletions });
          totalAdditions += additions;
          totalDeletions += deletions;
        }
      }

      // Sort by most changes first
      files.sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions));

      setState({
        files,
        totalAdditions,
        totalDeletions,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to get file changes",
      }));
    }
  };

  // Start/stop polling based on worktree path
  createEffect(() => {
    const path = worktreePath();

    // Clear existing timer
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    if (path) {
      // Fetch immediately
      fetchChanges();
      // Then poll
      pollTimer = setInterval(fetchChanges, pollInterval);
    } else {
      setState({
        files: [],
        totalAdditions: 0,
        totalDeletions: 0,
        loading: false,
        error: null,
      });
    }
  });

  onCleanup(() => {
    if (pollTimer) {
      clearInterval(pollTimer);
    }
  });

  return { state, refresh: fetchChanges };
}
