import { createSignal, onMount, onCleanup, type Accessor } from "solid-js";
import type { Issue } from "workhorse-core";
import { useWorkhorseContext } from "../context/workhorse.tsx";
import { getRepoIdentifier } from "./get-repo-identifier.ts";

export interface CreateIssuesOptions {
  /**
   * Repository identifier to filter issues by.
   * - If provided, only issues matching this repository are returned (all sources).
   * - If "auto", detects the current repo from git remote and filters all issues by it.
   * - If undefined, all issues are returned (no filtering).
   */
  repository?: string | "auto";
}

/**
 * Reactive primitive that fetches and tracks issues.
 * Automatically refreshes when issues are parsed, status changes, or agents are created.
 *
 * @param options - Optional configuration (e.g., repository filter)
 */
export function createIssues(options?: CreateIssuesOptions): Accessor<Issue[]> {
  const { hooks, tracker, paths } = useWorkhorseContext();
  const [issues, setIssues] = createSignal<Issue[]>([]);
  const [detectedRepo, setDetectedRepo] = createSignal<string | undefined>(undefined);

  onMount(async () => {
    // If auto mode, detect repository from git remote
    if (options?.repository === "auto") {
      setDetectedRepo(await getRepoIdentifier(paths.worktreesRoot.replace(/-worktrees$/, "")));
    }

    // Fetch function - handles filtering logic
    const fetchIssues = async (): Promise<Issue[]> => {
      // No filtering requested
      if (!options?.repository) {
        return tracker.fetchAll();
      }

      // Auto mode: use detected repo, or show all if detection failed
      if (options.repository === "auto") {
        const repo = detectedRepo();
        if (!repo) {
          // Could not detect repo - show all issues
          return tracker.fetchAll();
        }
        // Filter ALL issues by detected repository
        return tracker.fetchByRepository(repo);
      }

      // Explicit repository filter
      return tracker.fetchByRepository(options.repository);
    };

    // Initial fetch
    fetchIssues().then(setIssues);

    // Refresh on changes (async, but we don't await - fire and forget)
    const refresh = async () => setIssues(await fetchIssues());

    hooks.on("issue.parsed", refresh);
    hooks.on("issue.status_changed", refresh);
    hooks.on("issue.deleted", refresh);
    hooks.on("agent.create.post", refresh);

    onCleanup(() => {
      hooks.off("issue.parsed", refresh);
      hooks.off("issue.status_changed", refresh);
      hooks.off("issue.deleted", refresh);
      hooks.off("agent.create.post", refresh);
    });
  });

  return issues;
}
