/**
 * Reactive primitive that tracks Jiratown statuses for multiple issues.
 * Used by AgentList to show status for all agents.
 */

import { createSignal, onMount, onCleanup, createEffect, type Accessor } from "solid-js";
import type { IssueStatus, Issue } from "@jiratown/core";
import { useJiratownContext } from "../context/jiratown.tsx";

export interface CreateIssueStatusesOptions {
  /** Accessor returning array of issue IDs to track */
  issueIds: Accessor<string[]>;
}

/**
 * Create reactive issue status tracking for multiple issues.
 * Returns a function to get status by issue ID.
 */
export function createIssueStatuses(options: CreateIssueStatusesOptions) {
  const { issueIds } = options;
  const { tracker, hooks } = useJiratownContext();

  // Map of issueId -> status
  const [statuses, setStatuses] = createSignal<Map<string, IssueStatus>>(new Map());

  // Fetch when issueIds change
  createEffect(() => {
    issueIds(); // Subscribe
    void (async () => {
      const ids = issueIds();
      if (ids.length === 0) {
        setStatuses(new Map());
        return;
      }

      try {
        const statusMap = new Map<string, IssueStatus>();
        for (const issue of await tracker.fetchAll()) {
          if (ids.includes(issue.externalId)) {
            statusMap.set(issue.externalId, issue.status);
          }
        }
        setStatuses(statusMap);
      } catch {
        // Keep existing statuses on error
      }
    })();
  });

  // Listen for status changes
  onMount(() => {
    const handleStatusChange = ({ issue }: { issue: Issue }) => {
      if (issueIds().includes(issue.externalId)) {
        setStatuses((prev) => {
          const next = new Map(prev);
          next.set(issue.externalId, issue.status);
          return next;
        });
      }
    };

    hooks.on("issue.status_changed", handleStatusChange);

    onCleanup(() => {
      hooks.off("issue.status_changed", handleStatusChange);
    });
  });

  return {
    /** Get status for a specific issue ID */
    getStatus: (issueId: string): IssueStatus | null => statuses().get(issueId) ?? null,
    /** Refresh all statuses */
    refresh: () => {
      void (async () => {
        const ids = issueIds();
        if (ids.length === 0) {
          setStatuses(new Map());
          return;
        }

        try {
          const statusMap = new Map<string, IssueStatus>();
          for (const issue of await tracker.fetchAll()) {
            if (ids.includes(issue.externalId)) {
              statusMap.set(issue.externalId, issue.status);
            }
          }
          setStatuses(statusMap);
        } catch {
          // Keep existing statuses on error
        }
      })();
    },
  };
}
