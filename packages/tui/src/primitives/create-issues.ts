import { createSignal, onMount, onCleanup, type Accessor } from "solid-js";
import type { Issue } from "@jiratown/core";
import { useJiratownContext } from "../context/jiratown.tsx";

/**
 * Reactive primitive that fetches and tracks outstanding issues from the backlog.
 * Automatically refreshes when issues are parsed, status changes, or agents are created.
 */
export function createIssues(): Accessor<Issue[]> {
  const { hooks, tracker } = useJiratownContext();
  const [issues, setIssues] = createSignal<Issue[]>([]);

  onMount(() => {
    // Initial fetch
    tracker.fetchBacklog().then(setIssues);

    // Refresh on changes
    const refresh = () => tracker.fetchBacklog().then(setIssues);

    hooks.on("issue.parsed", refresh);
    hooks.on("issue.status_changed", refresh);
    hooks.on("issue.deleted", refresh);
    hooks.on("agent.create.post", refresh); // Remove from backlog when picked up

    onCleanup(() => {
      hooks.off("issue.parsed", refresh);
      hooks.off("issue.status_changed", refresh);
      hooks.off("issue.deleted", refresh);
      hooks.off("agent.create.post", refresh);
    });
  });

  return issues;
}
