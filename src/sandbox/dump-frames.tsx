#!/usr/bin/env bun
/**
 * Frame dump — renders every component and composed view, writes plain text
 * frames to src/sandbox/frames/ so they can be read and inspected.
 *
 * Usage:
 *   bun run src/sandbox/dump-frames.tsx
 *   bun run frames            # via package.json script
 *
 * The output directory is gitignored. Each file is a plain text snapshot of
 * exactly what the TUI renders at a given viewport size.
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { For } from "solid-js";
import { renderWithProviders, type RenderOptions } from "./test-helper.tsx";

import { Button } from "../components/button/button.tsx";
import { ButtonGroup } from "../components/button/button-group.tsx";
import { ActionBar } from "../components/button/action-bar.tsx";
import { Card } from "../components/card/card.tsx";
import { TextInput } from "../components/text-input/text-input.tsx";
import { Select } from "../components/select/select.tsx";
import { Dialog } from "../components/dialog/dialog.tsx";
import { Grid, GridCell } from "../components/grid/index.ts";
import { StatusBadge } from "../components/status-badge/status-badge.tsx";
import { Divider } from "../components/divider/divider.tsx";
import { TicketSidebar } from "../components/ticket-sidebar/ticket-sidebar.tsx";
import { TicketPane } from "../components/ticket-pane/ticket-pane.tsx";
import { Layout } from "../app/Layout.tsx";
import { TicketInput } from "../components/ticket-input/index.ts";

import type { Ticket, TicketStatus } from "../types/ticket.ts";
import type { ThemeName } from "../types/config.ts";
import type { JSX } from "solid-js";

// ─── Helpers ────────────────────────────────────────────────────

function makeTicket(id: string, overrides: Partial<Ticket> = {}): Ticket {
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

const OUT = join(import.meta.dir, "frames");

interface FrameSpec {
  name: string;
  component: () => JSX.Element;
  options?: RenderOptions;
  /** Optional: press keys before capturing */
  interactions?: (ctx: Awaited<ReturnType<typeof renderWithProviders>>) => Promise<void>;
}

const specs: FrameSpec[] = [
  // ── Buttons ──
  {
    name: "button-variants",
    options: { width: 30, height: 14 },
    component: () => (
      <box flexDirection="column" gap={1}>
        <Button label="Default" />
        <Button label="Primary" variant="primary" />
        <Button label="Success" variant="success" />
        <Button label="Warning" variant="warning" />
        <Button label="Danger" variant="danger" />
        <Button label="Disabled" disabled />
        <box height={1} />
        <Button label="Ghost" style="ghost" variant="primary" />
        <Button label="Shortcut" shortcut="Ctrl+S" variant="primary" />
        <Button label="Icon" icon="+" variant="success" />
      </box>
    ),
  },
  {
    name: "button-sizes",
    options: { width: 50, height: 3 },
    component: () => (
      <box flexDirection="row" gap={2}>
        <Button label="Sm" size="sm" variant="primary" />
        <Button label="Md" size="md" variant="primary" />
        <Button label="Lg" size="lg" variant="primary" />
      </box>
    ),
  },
  {
    name: "button-group",
    options: { width: 50, height: 3 },
    component: () => (
      <ButtonGroup
        buttons={[
          { label: "Save", shortcut: "s", variant: "primary" },
          { label: "Cancel", shortcut: "c" },
          { label: "Delete", shortcut: "d", variant: "danger" },
        ]}
        style="ghost"
        size="sm"
      />
    ),
  },
  {
    name: "action-bar",
    options: { width: 60, height: 3 },
    component: () => (
      <ActionBar
        actions={[
          { key: "e", action: "escalate" },
          { key: "a", action: "switch agent" },
          { key: "j", action: "open jira", variant: "primary" },
        ]}
      />
    ),
  },

  // ── Card ──
  {
    name: "card",
    options: { width: 55, height: 12 },
    component: () => (
      <box flexDirection="row" gap={1}>
        <Card title="Single" borderStyle="single" width={16}>
          <text>Content</text>
        </Card>
        <Card title="Double" borderStyle="double" width={16}>
          <text>Content</text>
        </Card>
        <Card title="Rounded" borderStyle="rounded" width={16}>
          <text>Content</text>
        </Card>
      </box>
    ),
  },

  // ── TextInput ──
  {
    name: "text-input-empty",
    options: { width: 45, height: 8 },
    component: () => (
      <TextInput inputId="d1" value="" onChange={() => {}} placeholder="Type here..." label="Name" width={40} />
    ),
  },
  {
    name: "text-input-filled",
    options: { width: 45, height: 8 },
    component: () => (
      <TextInput inputId="d2" value="AM-123" onChange={() => {}} label="Ticket" width={40} />
    ),
  },
  {
    name: "text-input-edit-mode",
    options: { width: 45, height: 8 },
    component: () => (
      <Grid rows={1} cols={1}>
        <GridCell id="ti" row={0} col={0}>
          <TextInput inputId="d3" value="editing" onChange={() => {}} width={40} />
        </GridCell>
      </Grid>
    ),
    interactions: async (ctx) => {
      ctx.mockInput.pressEnter();
      await ctx.renderOnce();
    },
  },

  // ── Select ──
  {
    name: "select-vertical",
    options: { width: 30, height: 10 },
    component: () => (
      <Select
        value="b"
        onChange={() => {}}
        options={[
          { value: "a", label: "OpenCode" },
          { value: "b", label: "Claude Code" },
          { value: "c", label: "Cursor" },
        ]}
        label="Agent"
      />
    ),
  },
  {
    name: "select-inline",
    options: { width: 50, height: 6 },
    component: () => (
      <Select
        value="medium"
        onChange={() => {}}
        options={[
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ]}
        label="Priority"
        inline
      />
    ),
  },

  // ── Dialog ──
  {
    name: "dialog-open",
    options: { width: 60, height: 20 },
    component: () => (
      <Dialog
        isOpen={true}
        onClose={() => {}}
        lockId="dump-dialog"
        title="Confirm Action"
        hint="Press Escape to close"
        width={45}
        height={10}
      >
        <text>Are you sure you want to proceed?</text>
      </Dialog>
    ),
  },
  {
    name: "dialog-with-footer",
    options: { width: 60, height: 20 },
    component: () => (
      <Dialog
        isOpen={true}
        onClose={() => {}}
        lockId="dump-dialog-f"
        title="Delete Ticket"
        width={45}
        height={12}
        footer={
          <box flexDirection="row" gap={2} justifyContent="flex-end">
            <Button label="Cancel" style="ghost" size="sm" />
            <Button label="Delete" variant="danger" size="sm" />
          </box>
        }
      >
        <text>This cannot be undone.</text>
      </Dialog>
    ),
  },

  // ── Grid ──
  {
    name: "grid",
    options: { width: 40, height: 6 },
    component: () => (
      <Grid rows={2} cols={3} wrap>
        <box flexDirection="column" gap={1}>
          <box flexDirection="row" gap={1}>
            <GridCell id="a" row={0} col={0}><Button label="A" variant="primary" /></GridCell>
            <GridCell id="b" row={0} col={1}><Button label="B" variant="success" /></GridCell>
            <GridCell id="c" row={0} col={2}><Button label="C" variant="warning" /></GridCell>
          </box>
          <box flexDirection="row" gap={1}>
            <GridCell id="d" row={1} col={0}><Button label="D" style="ghost" /></GridCell>
            <GridCell id="e" row={1} col={1}><Button label="E" style="ghost" /></GridCell>
            <GridCell id="f" row={1} col={2}><Button label="F" style="ghost" /></GridCell>
          </box>
        </box>
      </Grid>
    ),
  },

  // ── StatusBadge ──
  {
    name: "status-badges",
    options: { width: 60, height: 20 },
    component: () => {
      const statuses: TicketStatus[] = [
        "pending", "queued", "planning", "implementing",
        "blocked", "pr_created", "in_review", "done",
      ];
      return (
        <box flexDirection="column">
          <For each={statuses}>
            {(s) => (
              <box flexDirection="row" gap={2}>
                <StatusBadge status={s} />
                <StatusBadge status={s} showLabel={false} />
                <StatusBadge status={s} compact />
              </box>
            )}
          </For>
        </box>
      );
    },
  },

  // ── Divider ──
  {
    name: "dividers",
    options: { width: 50, height: 12 },
    component: () => (
      <box flexDirection="column">
        <Divider />
        <Divider label="OR" />
        <Divider char="═" />
        <Divider length={20} />
      </box>
    ),
  },

  // ── Composed: TicketSidebar ──
  {
    name: "sidebar-empty",
    options: { width: 32, height: 18 },
    component: () => (
      <TicketSidebar tickets={[]} selectedIndex={0} width={28} onSelect={() => {}} onNew={() => {}} />
    ),
  },
  {
    name: "sidebar-with-tickets",
    options: { width: 32, height: 18 },
    component: () => (
      <TicketSidebar
        tickets={[
          makeTicket("AM-101", { status: "implementing" }),
          makeTicket("AM-102", { status: "done" }),
          makeTicket("AM-103", { status: "blocked" }),
        ]}
        selectedIndex={1}
        width={28}
        onSelect={() => {}}
        onNew={() => {}}
      />
    ),
  },

  // ── Composed: TicketPane ──
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

  // ── Composed: Layout ──
  {
    name: "layout",
    options: { width: 80, height: 24 },
    component: () => (
      <Layout
        rig="github.com/acme/webapp"
        showAll={false}
        onQuit={() => {}}
        onAddTicket={() => {}}
        onCloseTicket={() => {}}
        onOpenInJira={() => {}}
        onEscalate={() => {}}
        onSwitchAgent={() => {}}
        sidebar={<text>Sidebar Here</text>}
      >
        <text>Main Content Here</text>
      </Layout>
    ),
  },

  // ── TicketInput modal ──
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
      ctx.mockInput.pressEnter(); // enter edit mode
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

  // ═══════════════════════════════════════════════════════════════
  // Stress / adversarial cases
  // ═══════════════════════════════════════════════════════════════

  // ── Tiny viewports ──
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
        tickets={[makeTicket("AM-1"), makeTicket("AM-2"), makeTicket("AM-3")]}
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
      <Layout
        rig="github.com/org/repo"
        showAll={false}
        onQuit={() => {}}
        onAddTicket={() => {}}
        onCloseTicket={() => {}}
        onOpenInJira={() => {}}
        onEscalate={() => {}}
        onSwitchAgent={() => {}}
        sidebar={<text>Side</text>}
      >
        <text>Main</text>
      </Layout>
    ),
  },
  {
    name: "stress-dialog-bigger-than-viewport",
    options: { width: 20, height: 8 },
    component: () => (
      <Dialog isOpen={true} onClose={() => {}} lockId="stress-d" title="Big Dialog" width={50} height={20}>
        <text>This dialog is bigger than the terminal</text>
      </Dialog>
    ),
  },

  // ── Overflow text ──
  {
    name: "stress-button-long-label",
    options: { width: 30, height: 3 },
    component: () => <Button label="This is an extremely long button label that should overflow" variant="primary" />,
  },
  {
    name: "stress-pane-long-summary",
    options: { width: 60, height: 20 },
    component: () => (
      <TicketPane
        ticket={makeTicket("LONGTICKET-99999", {
          summary: "This is a very long ticket summary that describes a complex issue involving authentication timeouts when connecting to multiple microservices in parallel across different availability zones",
          branch_name: "feat/LONGTICKET-99999-this-is-also-a-very-long-branch-name-that-exceeds-expectations",
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
        tickets={[makeTicket("VERYLONGPROJECT-12345"), makeTicket("ANOTHERLONGONE-67890")]}
        selectedIndex={0}
        width={20}
        onSelect={() => {}}
        onNew={() => {}}
      />
    ),
  },

  // ── Missing data ──
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

  // ── Extreme quantities ──
  {
    name: "stress-sidebar-20-tickets",
    options: { width: 32, height: 15 },
    component: () => {
      const tickets = Array.from({ length: 20 }, (_, i) =>
        makeTicket(`TK-${i + 1}`, {
          status: (["pending", "queued", "implementing", "done", "blocked"] as const)[i % 5],
        }),
      );
      return (
        <TicketSidebar tickets={tickets} selectedIndex={10} width={28} onSelect={() => {}} onNew={() => {}} />
      );
    },
  },

  // ── Unicode ──
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

// ─── Run ────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUT, { recursive: true });

  let count = 0;
  for (const spec of specs) {
    const ctx = await renderWithProviders(spec.component, spec.options);
    if (spec.interactions) {
      await spec.interactions(ctx);
    }
    const frame = ctx.captureCharFrame();
    const path = join(OUT, `${spec.name}.txt`);
    writeFileSync(path, frame);
    count++;
    console.log(`  ✓ ${spec.name}`);
  }

  console.log(`\nDumped ${count} frames to ${OUT}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
