/**
 * Reactive primitive that tracks the Workhorse status for an issue.
 * Listens to issue.status_changed hook for real-time updates.
 */

import { createSignal, onMount, onCleanup, createEffect, type Accessor } from "solid-js";
import type { IssueStatus, Issue } from "workhorse-core";
import { useWorkhorseContext } from "../context/workhorse.tsx";

export interface IssueStatusState {
  status: IssueStatus | null;
  loading: boolean;
}

export interface CreateIssueStatusOptions {
  /** Issue ID (external ID) to track status for */
  issueId: Accessor<string | null>;
}

/**
 * Create reactive issue status tracking.
 * Fetches initial status from DB and updates on status_changed hook.
 */
export function createIssueStatus(options: CreateIssueStatusOptions) {
  const { issueId } = options;
  const { tracker, hooks } = useWorkhorseContext();

  const [state, setState] = createSignal<IssueStatusState>({
    status: null,
    loading: false,
  });

  // Fetch on issueId change
  createEffect(() => {
    issueId(); // Subscribe
    void (async () => {
      const id = issueId();
      if (!id) {
        setState({ status: null, loading: false });
        return;
      }

      setState((prev) => ({ ...prev, loading: true }));

      try {
        setState({
          status: await tracker
            .fetchAll()
            .then((r) => r.find((i: Issue) => i.externalId === id)?.status ?? null),
          loading: false,
        });
      } catch {
        setState({ status: null, loading: false });
      }
    })();
  });

  // Listen for status changes
  onMount(() => {
    const handleStatusChange = ({
      issue,
    }: {
      issue: { externalId: string; status: IssueStatus };
    }) => {
      if (issue.externalId === issueId()) {
        setState({ status: issue.status, loading: false });
      }
    };

    hooks.on("issue.status_changed", handleStatusChange);

    onCleanup(() => {
      hooks.off("issue.status_changed", handleStatusChange);
    });
  });

  return {
    state,
    refresh: () => {
      void (async () => {
        const id = issueId();
        if (!id) {
          setState({ status: null, loading: false });
          return;
        }

        setState((prev) => ({ ...prev, loading: true }));

        try {
          setState({
            status: await tracker
              .fetchAll()
              .then((r) => r.find((i: Issue) => i.externalId === id)?.status ?? null),
            loading: false,
          });
        } catch {
          setState({ status: null, loading: false });
        }
      })();
    },
  };
}
