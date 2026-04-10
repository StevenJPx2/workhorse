import type { Accessor } from "solid-js";
import type { TicketStatus } from "../../types/ticket.ts";

export interface UseJiraSyncOptions {
  cloudId?: string | (() => string | undefined);
  onSyncError?: (error: Error) => void;
  onSyncSuccess?: (ticketId: string, action: string) => void;
}

export interface JiraSyncProgress {
  ticketId: string;
  message: string;
  timestamp: string;
}

export interface JiraSyncStatus {
  inProgress: boolean;
  lastSync: string | null;
  error: string | null;
}

export interface JiraTransition {
  id: string;
  name: string;
  toStatus: string;
}

export type JiraSyncAction = "comment" | "transition" | "link_pr";

export interface UseJiraSyncReturn {
  syncStatus: Accessor<Record<string, JiraSyncStatus>>;
  isSyncing: Accessor<boolean>;

  postProgress: (
    ticketKey: string,
    ticketId: string,
    message: string
  ) => Promise<void>;

  transitionStatus: (
    ticketKey: string,
    ticketId: string,
    status: TicketStatus
  ) => Promise<void>;

  linkPR: (
    ticketKey: string,
    ticketId: string,
    prUrl: string
  ) => Promise<void>;

  syncAll: (ticketId: string) => Promise<void>;
}