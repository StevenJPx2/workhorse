import type { JSX, Accessor } from "solid-js";
import type { Ticket, TicketStatus } from "../../types/ticket.ts";

export function tickets(arr: Ticket[]): Accessor<Ticket[]> {
  return () => arr;
}

export function MockLayout(props: {
  rig: string;
  showAll: boolean;
  sidebar?: JSX.Element;
  children?: JSX.Element;
}) {
  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexGrow={1} flexDirection="row">
        {props.sidebar}
        <box flexGrow={1}>{props.children}</box>
      </box>
      <box height={1}>
        <text>{props.showAll ? "all repos" : props.rig} | [?] help | [q] quit</text>
      </box>
    </box>
  );
}

export function makeTicket(id: string, overrides: Partial<Ticket> = {}): Ticket {
  return {
    id,
    jira_key: id,
    jira_url: `https://jira.example.com/browse/${id}`,
    summary: `Fix ${id} issue`,
    status: "implementing" as TicketStatus,
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