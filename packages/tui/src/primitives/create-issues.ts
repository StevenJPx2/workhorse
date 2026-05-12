import { createSignal, onMount, onCleanup, type Accessor } from "solid-js";
import type { Issue } from "@jiratown/core";
import { useJiratownContext } from "../context/jiratown.tsx";

/**
 * Reactive primitive that fetches and tracks all issues.
 * Automatically refreshes when issues are parsed, status changes, or agents are created.
 */
export function createIssues(): Accessor<Issue[]> {
  const { hooks, tracker } = useJiratownContext();
  const [issues, setIssues] = createSignal<Issue[]>([]);

  onMount(() => {
    // Initial fetch - get ALL issues, not just backlog
    tracker.fetchAll().then(setIssues);

    // Refresh on changes
    const refresh = () => tracker.fetchAll().then(setIssues);

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
