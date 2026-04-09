import { TicketSidebar } from "../../components/ticket-sidebar/ticket-sidebar.tsx";
import { TicketPane } from "../../components/ticket-pane/ticket-pane.tsx";
import { TicketInput } from "../../components/ticket-input/index.ts";
import { tickets, makeTicket, MockLayout } from "./helpers.tsx";
import type { FrameSpec } from "./types.ts";

export const composedSpecs: FrameSpec[] = [
  {
    name: "sidebar-empty",
    options: { width: 32, height: 18 },
    component: () => (
      <TicketSidebar tickets={tickets([])} selectedIndex={0} width={28} onSelect={() => {}} onNew={() => {}} />
    ),
  },
  {
    name: "sidebar-with-tickets",
    options: { width: 32, height: 18 },
    component: () => (
      <TicketSidebar
        tickets={tickets([
          makeTicket("AM-101", { status: "implementing" }),
          makeTicket("AM-102", { status: "done" }),
          makeTicket("AM-103", { status: "blocked" }),
        ])}
        selectedIndex={1}
        width={28}
        onSelect={() => {}}
        onNew={() => {}}
      />
    ),
  },
  {
    name: "ticket-pane",
    options: { width: 70, height: 24 },
    component: () => (
      <TicketPane
        ticket={makeTicket("AM-456", {
          summary: "Fix login timeout on slow networks",
          status: "implementing",
          agent: "opencode",
          branch_name: "feat/am-456-fix-login",
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
    name: "layout",
    options: { width: 80, height: 24 },
    component: () => (
      <MockLayout
        rig="github.com/acme/webapp"
        showAll={false}
        sidebar={<text>Sidebar Here</text>}
      >
        <text>Main Content Here</text>
      </MockLayout>
    ),
  },
  {
    name: "ticket-input-open",
    options: { width: 60, height: 24 },
    component: () => (
      <TicketInput
        isOpen={true}
        onClose={() => {}}
        onSubmit={() => {}}
        fetchIssue={async () => { throw new Error("not connected"); }}
      />
    ),
  },
  {
    name: "ticket-input-edit-mode",
    options: { width: 60, height: 24 },
    component: () => (
      <TicketInput
        isOpen={true}
        onClose={() => {}}
        onSubmit={() => {}}
        fetchIssue={async () => { throw new Error("not connected"); }}
      />
    ),
    interactions: async (ctx) => {
      ctx.mockInput.pressEnter();
      await ctx.renderOnce();
    },
  },
  {
    name: "ticket-input-typing",
    options: { width: 60, height: 24 },
    component: () => (
      <TicketInput
        isOpen={true}
        onClose={() => {}}
        onSubmit={() => {}}
        fetchIssue={async () => { throw new Error("not connected"); }}
      />
    ),
    interactions: async (ctx) => {
      ctx.mockInput.pressEnter();
      await ctx.renderOnce();
      for (const ch of ["A", "M", "-", "1", "2", "3"]) {
        ctx.mockInput.pressKey(ch);
        await ctx.renderOnce();
      }
    },
  },
];