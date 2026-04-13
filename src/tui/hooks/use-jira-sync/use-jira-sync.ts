import { createSignal, createMemo, onCleanup } from "solid-js";
import { useAtlassian } from "../use-atlassian/index.ts";
import { updateTicket } from "#core/db/index.ts";
import { insertTicketEvent } from "#core/db/events.ts";
import {
  getTransitionId,
  formatPRComment,
  formatSyncSuccessMessage,
  formatSyncFailureMessage,
} from "#core/jira/index.ts";
import type {
  UseJiraSyncOptions,
  UseJiraSyncReturn,
  JiraSyncStatus,
  JiraSyncAction,
} from "./types.ts";

export function useJiraSync(options: UseJiraSyncOptions = {}): UseJiraSyncReturn {
  const [syncStatuses, setSyncStatuses] = createSignal<Record<string, JiraSyncStatus>>({});
  const [isSyncing, setIsSyncing] = createSignal(false);

  const atlassian = useAtlassian({
    cloudId: options.cloudId,
  });

  const syncStatus = createMemo(() => syncStatuses());

  function setSyncStatus(ticketId: string, update: Partial<JiraSyncStatus>) {
    setSyncStatuses((prev) => ({
      ...prev,
      [ticketId]: {
        inProgress: update.inProgress ?? prev[ticketId]?.inProgress ?? false,
        lastSync: update.lastSync ?? prev[ticketId]?.lastSync ?? null,
        error: update.error !== undefined ? update.error : (prev[ticketId]?.error ?? null),
      },
    }));
  }

  function clearSyncStatus(ticketId: string) {
    setSyncStatuses((prev) => {
      const next = { ...prev };
      delete next[ticketId];
      return next;
    });
  }

  function recordSyncEvent(ticketId: string, action: JiraSyncAction, detail: string) {
    insertTicketEvent({
      ticket_id: ticketId,
      event_type: "comment",
      payload: {
        source: "system",
        content: `[jira-sync:${action}] ${detail}`,
      },
    });
  }

  async function withSyncLock<T>(
    ticketId: string,
    action: JiraSyncAction,
    fn: () => Promise<T>,
  ): Promise<T> {
    setSyncStatus(ticketId, { inProgress: true, error: null });
    setIsSyncing(true);

    try {
      const result = await fn();
      const now = new Date().toISOString();
      setSyncStatus(ticketId, { inProgress: false, lastSync: now });

      updateTicket(ticketId, { last_jira_sync: now });
      recordSyncEvent(ticketId, action, formatSyncSuccessMessage(action, now));
      options.onSyncSuccess?.(ticketId, action);

      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setSyncStatus(ticketId, { inProgress: false, error: error.message });
      options.onSyncError?.(error);
      recordSyncEvent(ticketId, action, formatSyncFailureMessage(action, error.message));
      throw error;
    } finally {
      setIsSyncing(false);
    }
  }

  async function postProgress(ticketKey: string, ticketId: string, message: string): Promise<void> {
    await withSyncLock(ticketId, "comment", async () => {
      await atlassian.addComment(ticketKey, message);
    });
  }

  async function transitionStatus(
    ticketKey: string,
    ticketId: string,
    status: string,
  ): Promise<void> {
    await withSyncLock(ticketId, "transition", async () => {
      const transitionId = getTransitionId(status);
      if (!transitionId) {
        throw new Error(
          `No transition mapping for status "${status}". Update STATUS_TRANSITION_MAP.`,
        );
      }
      await atlassian.transitionIssue(ticketKey, transitionId);
    });
  }

  async function linkPR(ticketKey: string, ticketId: string, prUrl: string): Promise<void> {
    await withSyncLock(ticketId, "link_pr", async () => {
      await atlassian.addComment(ticketKey, formatPRComment(prUrl));
      updateTicket(ticketId, { pr_url: prUrl });
    });
  }

  async function syncAll(ticketId: string): Promise<void> {
    const status = syncStatuses()[ticketId];
    if (status?.inProgress) return;

    setSyncStatus(ticketId, { inProgress: true, error: null });
    setIsSyncing(true);

    try {
      const now = new Date().toISOString();
      updateTicket(ticketId, { last_jira_sync: now });
      setSyncStatus(ticketId, { inProgress: false, lastSync: now });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setSyncStatus(ticketId, { inProgress: false, error: error.message });
      options.onSyncError?.(error);
    } finally {
      setIsSyncing(false);
    }
  }

  onCleanup(() => {
    Object.keys(syncStatuses()).forEach(clearSyncStatus);
  });

  return {
    syncStatus,
    isSyncing,
    postProgress,
    transitionStatus,
    linkPR,
    syncAll,
  };
}
