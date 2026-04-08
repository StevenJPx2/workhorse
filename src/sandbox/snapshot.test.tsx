/**
 * TUI snapshot tests
 *
 * Captures the full rendered frame of each component and composed view.
 * When a snapshot changes, the diff shows exactly what shifted in the UI.
 *
 * To update snapshots after intentional changes:
 *   bun test src/sandbox/snapshot.test.tsx --update-snapshots
 */

import { describe, it, expect } from "bun:test";
import { For } from "solid-js";
import { renderWithProviders } from "./test-helper.tsx";
import type { ThemeName } from "../types/config.ts";
import type { Ticket, TicketStatus } from "../types/ticket.ts";

// --- Components ---
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

// --- Composed views ---
import { TicketSidebar } from "../components/ticket-sidebar/ticket-sidebar.tsx";
import { TicketPane } from "../components/ticket-pane/ticket-pane.tsx";
import { Layout } from "../app/Layout.tsx";

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

const THEMES: ThemeName[] = ["tokyonight", "gruvbox", "default"];

// ─── Core component snapshots ────────────────────────────────────

describe("Button snapshots", () => {
  it("variants", async () => {
    const ctx = await renderWithProviders(
      () => (
        <box flexDirection="column" gap={1}>
          <Button label="Default" />
          <Button label="Primary" variant="primary" />
          <Button label="Success" variant="success" />
          <Button label="Warning" variant="warning" />
          <Button label="Danger" variant="danger" />
          <Button label="Disabled" disabled />
        </box>
      ),
      { width: 30, height: 12 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("ghost style", async () => {
    const ctx = await renderWithProviders(
      () => (
        <box flexDirection="column" gap={1}>
          <Button label="Ghost Default" style="ghost" />
          <Button label="Ghost Primary" variant="primary" style="ghost" />
          <Button label="Ghost Danger" variant="danger" style="ghost" />
        </box>
      ),
      { width: 30, height: 8 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("sizes", async () => {
    const ctx = await renderWithProviders(
      () => (
        <box flexDirection="row" gap={2}>
          <Button label="Sm" size="sm" variant="primary" />
          <Button label="Md" size="md" variant="primary" />
          <Button label="Lg" size="lg" variant="primary" />
        </box>
      ),
      { width: 40, height: 3 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("shortcuts and icons", async () => {
    const ctx = await renderWithProviders(
      () => (
        <box flexDirection="column" gap={1}>
          <Button label="New" icon="+" variant="success" />
          <Button label="save" shortcut="Ctrl+S" variant="primary" />
          <Button label="Delete" icon="×" iconPosition="right" variant="danger" />
        </box>
      ),
      { width: 30, height: 6 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });
});

describe("ButtonGroup snapshot", () => {
  it("default", async () => {
    const ctx = await renderWithProviders(
      () => (
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
      { width: 50, height: 3 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });
});

describe("ActionBar snapshot", () => {
  it("default", async () => {
    const ctx = await renderWithProviders(
      () => (
        <ActionBar
          actions={[
            { key: "e", action: "escalate" },
            { key: "a", action: "switch agent" },
            { key: "j", action: "open jira", variant: "primary" },
          ]}
        />
      ),
      { width: 60, height: 3 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });
});

describe("Card snapshots", () => {
  it("with title", async () => {
    const ctx = await renderWithProviders(
      () => (
        <Card title="Ticket Details" width={40}>
          <text>AM-123: Fix authentication bug</text>
          <text>Status: In Progress</text>
        </Card>
      ),
      { width: 45, height: 10 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("border styles", async () => {
    const ctx = await renderWithProviders(
      () => (
        <box flexDirection="row" gap={1}>
          <Card title="Single" borderStyle="single" width={16}>
            <text>A</text>
          </Card>
          <Card title="Double" borderStyle="double" width={16}>
            <text>B</text>
          </Card>
          <Card title="Rounded" borderStyle="rounded" width={16}>
            <text>C</text>
          </Card>
        </box>
      ),
      { width: 55, height: 8 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });
});

describe("TextInput snapshots", () => {
  it("empty with placeholder", async () => {
    const ctx = await renderWithProviders(
      () => (
        <TextInput
          inputId="snap-1"
          value=""
          onChange={() => {}}
          placeholder="Type here..."
          label="Name"
          width={40}
        />
      ),
      { width: 45, height: 8 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("with value", async () => {
    const ctx = await renderWithProviders(
      () => (
        <TextInput
          inputId="snap-2"
          value="AM-123"
          onChange={() => {}}
          label="Ticket"
          width={40}
        />
      ),
      { width: 45, height: 8 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("in grid edit mode shows cursor", async () => {
    const ctx = await renderWithProviders(
      () => (
        <Grid rows={1} cols={1}>
          <GridCell id="ti" row={0} col={0}>
            <TextInput
              inputId="snap-grid"
              value="hello"
              onChange={() => {}}
              width={40}
            />
          </GridCell>
        </Grid>
      ),
      { width: 45, height: 8 },
    );
    // Enter edit mode
    ctx.mockInput.pressEnter();
    await ctx.renderOnce();
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });
});

describe("Select snapshots", () => {
  const options = [
    { value: "a", label: "OpenCode" },
    { value: "b", label: "Claude Code" },
    { value: "c", label: "Cursor" },
  ];

  it("vertical", async () => {
    const ctx = await renderWithProviders(
      () => <Select value="b" onChange={() => {}} options={options} label="Agent" />,
      { width: 30, height: 10 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("inline", async () => {
    const ctx = await renderWithProviders(
      () => <Select value="a" onChange={() => {}} options={options} inline label="Agent" />,
      { width: 50, height: 6 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });
});

describe("Dialog snapshots", () => {
  it("open with title and hint", async () => {
    const ctx = await renderWithProviders(
      () => (
        <Dialog
          isOpen={true}
          onClose={() => {}}
          lockId="snap-dialog"
          title="Confirm Action"
          hint="Press Escape to close"
          width={45}
          height={10}
        >
          <text>Are you sure you want to proceed?</text>
        </Dialog>
      ),
      { width: 60, height: 20 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("with footer buttons", async () => {
    const ctx = await renderWithProviders(
      () => (
        <Dialog
          isOpen={true}
          onClose={() => {}}
          lockId="snap-dialog-footer"
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
      { width: 60, height: 20 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("closed renders nothing", async () => {
    const ctx = await renderWithProviders(
      () => (
        <Dialog
          isOpen={false}
          onClose={() => {}}
          lockId="snap-closed"
          title="Hidden"
        >
          <text>invisible</text>
        </Dialog>
      ),
      { width: 40, height: 10 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });
});

describe("Grid snapshot", () => {
  it("3x3 with buttons", async () => {
    const ctx = await renderWithProviders(
      () => (
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
      { width: 40, height: 6 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("after navigating down", async () => {
    const ctx = await renderWithProviders(
      () => (
        <Grid rows={2} cols={1}>
          <box flexDirection="column">
            <GridCell id="top" row={0} col={0}><Button label="Top" variant="primary" /></GridCell>
            <GridCell id="bot" row={1} col={0}><Button label="Bottom" variant="success" /></GridCell>
          </box>
        </Grid>
      ),
      { width: 20, height: 4 },
    );
    ctx.mockInput.pressArrow("down");
    await ctx.renderOnce();
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });
});

describe("StatusBadge snapshots", () => {
  const statuses: TicketStatus[] = [
    "pending", "queued", "planning", "implementing",
    "blocked", "pr_created", "in_review", "done",
  ];

  it("all statuses", async () => {
    const ctx = await renderWithProviders(
      () => (
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
      ),
      { width: 60, height: 20 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });
});

describe("Divider snapshots", () => {
  it("variants", async () => {
    const ctx = await renderWithProviders(
      () => (
        <box flexDirection="column">
          <Divider />
          <Divider label="OR" />
          <Divider char="═" />
          <Divider length={20} />
        </box>
      ),
      { width: 50, height: 12 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });
});

// ─── Composed view snapshots ─────────────────────────────────────

describe("TicketSidebar snapshots", () => {
  it("empty state", async () => {
    const ctx = await renderWithProviders(
      () => (
        <TicketSidebar
          tickets={[]}
          selectedIndex={0}
          width={28}
          onSelect={() => {}}
          onNew={() => {}}
        />
      ),
      { width: 32, height: 18 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("with tickets", async () => {
    const ctx = await renderWithProviders(
      () => (
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
      { width: 32, height: 18 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });
});

describe("TicketPane snapshots", () => {
  it("default", async () => {
    const ctx = await renderWithProviders(
      () => (
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
      { width: 70, height: 24 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });
});

describe("Layout snapshots", () => {
  it("with sidebar and content", async () => {
    const ctx = await renderWithProviders(
      () => (
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
      { width: 80, height: 24 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("all-repos mode", async () => {
    const ctx = await renderWithProviders(
      () => (
        <Layout
          rig={null}
          showAll={true}
          onQuit={() => {}}
          onAddTicket={() => {}}
          onCloseTicket={() => {}}
          onOpenInJira={() => {}}
          onEscalate={() => {}}
          onSwitchAgent={() => {}}
          sidebar={<text>side</text>}
        >
          <text>main</text>
        </Layout>
      ),
      { width: 80, height: 24 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });
});

// ─── Cross-theme snapshots ───────────────────────────────────────

describe("Theme consistency", () => {
  for (const theme of THEMES) {
    it(`TicketSidebar in ${theme}`, async () => {
      const ctx = await renderWithProviders(
        () => (
          <TicketSidebar
            tickets={[makeTicket("TH-1"), makeTicket("TH-2", { status: "done" })]}
            selectedIndex={0}
            width={28}
            onSelect={() => {}}
            onNew={() => {}}
          />
        ),
        { width: 32, height: 16, theme },
      );
      expect(ctx.captureCharFrame()).toMatchSnapshot();
    });
  }
});
