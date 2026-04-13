import { Button } from "../../components/button/button.tsx";
import { Card } from "../../components/card/card.tsx";
import { Select } from "../../components/select/select.tsx";
import { Dialog } from "../../components/dialog/dialog.tsx";
import { TicketSidebar } from "../../components/ticket-sidebar/ticket-sidebar.tsx";
import { TicketPane } from "../../components/ticket-pane/ticket-pane.tsx";
import { tickets, makeTicket, MockLayout } from "./helpers.tsx";
import type { FrameSpec } from "./types.ts";

export const stressSpecs: FrameSpec[] = [
  {
    name: "stress-button-5x1",
    options: { width: 5, height: 1 },
    component: () => <Button label="Submit Changes" variant="primary" />,
  },
  {
    name: "stress-card-8x3",
    options: { width: 8, height: 3 },
    component: () => (
      <Card title="This Title Is Way Too Long" width={8}>
        <text>Content that overflows</text>
      </Card>
    ),
  },
  {
    name: "stress-sidebar-10x5",
    options: { width: 10, height: 5 },
    component: () => (
      <TicketSidebar
        tickets={tickets([makeTicket("AM-1"), makeTicket("AM-2"), makeTicket("AM-3")])}
        selectedIndex={0}
        width={10}
        onSelect={() => {}}
        onNew={() => {}}
      />
    ),
  },
  {
    name: "stress-layout-20x5",
    options: { width: 20, height: 5 },
    component: () => (
      <MockLayout rig="github.com/org/repo" showAll={false} sidebar={<text>Side</text>}>
        <text>Main</text>
      </MockLayout>
    ),
  },
  {
    name: "stress-dialog-bigger-than-viewport",
    options: { width: 20, height: 8 },
    component: () => (
      <Dialog
        isOpen={true}
        onClose={() => {}}
        lockId="stress-d"
        title="Big Dialog"
        width={50}
        height={20}
      >
        <text>This dialog is bigger than the terminal</text>
      </Dialog>
    ),
  },
  {
    name: "stress-button-long-label",
    options: { width: 30, height: 3 },
    component: () => (
      <Button
        label="This is an extremely long button label that should overflow"
        variant="primary"
      />
    ),
  },
  {
    name: "stress-pane-long-summary",
    options: { width: 60, height: 20 },
    component: () => (
      <TicketPane
        ticket={makeTicket("LONGTICKET-99999", {
          summary:
            "This is a very long ticket summary that describes a complex issue involving authentication timeouts when connecting to multiple microservices in parallel across different availability zones",
          branch_name:
            "feat/LONGTICKET-99999-this-is-also-a-very-long-branch-name-that-exceeds-expectations",
          worktree_path: null,
        })}
        events={[]}
        onEscalate={() => {}}
        onSwitchAgent={() => {}}
        onOpenJira={() => {}}
        onClose={() => {}}
        onSendMessage={() => {}}
      />
    ),
  },
  {
    name: "stress-sidebar-long-ids",
    options: { width: 24, height: 12 },
    component: () => (
      <TicketSidebar
        tickets={tickets([makeTicket("VERYLONGPROJECT-12345"), makeTicket("ANOTHERLONGONE-67890")])}
        selectedIndex={0}
        width={20}
        onSelect={() => {}}
        onNew={() => {}}
      />
    ),
  },
  {
    name: "stress-pane-null-summary",
    options: { width: 60, height: 20 },
    component: () => (
      <TicketPane
        ticket={makeTicket("AM-000", {
          summary: null,
          branch_name: null,
          worktree_path: null,
          agent_pid: null,
          pr_url: null,
          jira_url: null,
        })}
        events={[]}
        onEscalate={() => {}}
        onSwitchAgent={() => {}}
        onOpenJira={() => {}}
        onClose={() => {}}
        onSendMessage={() => {}}
      />
    ),
  },
  {
    name: "stress-select-empty",
    options: { width: 30, height: 6 },
    component: () => <Select value="" onChange={() => {}} options={[]} label="Nothing here" />,
  },
  {
    name: "stress-sidebar-20-tickets",
    options: { width: 32, height: 15 },
    component: () => {
      const ticketList = Array.from({ length: 20 }, (_, i) =>
        makeTicket(`TK-${i + 1}`, {
          status: (["pending", "queued", "implementing", "done", "blocked"] as const)[i % 5],
        }),
      );
      return (
        <TicketSidebar
          tickets={tickets(ticketList)}
          selectedIndex={10}
          width={28}
          onSelect={() => {}}
          onNew={() => {}}
        />
      );
    },
  },
  {
    name: "stress-unicode-buttons",
    options: { width: 30, height: 6 },
    component: () => (
      <box flexDirection="column" gap={1}>
        <Button label="日本語テスト" variant="primary" />
        <Button label="émojis 🎉🔥" variant="success" />
        <Button label="→ arrows ←" variant="warning" />
      </box>
    ),
  },
  {
    name: "stress-unicode-ticket",
    options: { width: 60, height: 16 },
    component: () => (
      <TicketPane
        ticket={makeTicket("UNI-1", {
          summary: "修复登录超时问题 — résumé endpoint 🐛",
        })}
        events={[]}
        onEscalate={() => {}}
        onSwitchAgent={() => {}}
        onOpenJira={() => {}}
        onClose={() => {}}
        onSendMessage={() => {}}
      />
    ),
  },
];
