
import type { ThemeName } from "../../types/config.ts";
import type { Ticket, TicketStatus } from "../../types/ticket.ts";
import type { Accessor } from "solid-js";

export function makeTicket(id: string, overrides: Partial<Ticket> = {}): Ticket {
  return {
    id,
    jira_key: id,
    jira_url: `https://jira.example.com/browse/${id}`,
    summary: `Fix ${id} issue`,
    status: "implementing",
    rig: "github.com/test/repo",
    worktree_path: null,
    branch_name: `feat/${id.toLowerCase()}`,
    agent: "opencode",
    agent_pid: null,
    pr_url: null,
    created_at: "2026-01-15T10:00:00Z",
    updated_at: "2026-01-15T10:00:00Z",
    last_jira_sync: null,
    ...overrides,
  };
}

export const THEMES: ThemeName[] = ["tokyonight", "gruvbox", "default"];

export function ticketsAccessor(arr: Ticket[]): Accessor<Ticket[]> {
  return () => arr;
}

export const ALL_STATUSES: TicketStatus[] = [
  "pending", "queued", "planning", "implementing",
  "blocked", "pr_created", "in_review", "done",
];