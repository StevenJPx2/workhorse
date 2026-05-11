/**
 * Stress / adversarial snapshot tests
 *
 * These intentionally push components into edge cases — tiny viewports,
 * overflowing text, missing data, extreme values — to surface layout bugs
 * that normal usage wouldn't hit.
 *
 * To update after intentional fixes:
 *   bun test src/sandbox/stress.test.tsx --update-snapshots
 */

import { describe, it, expect } from "bun:test";
import { For } from "solid-js";
import { renderWithProviders, renderLayoutWithProviders } from "./test-helper.tsx";

import { Button } from "../../components/button/button.tsx";
import { ButtonGroup } from "../../components/button/button-group.tsx";
import { ActionBar } from "../../components/button/action-bar.tsx";
import { Card } from "../../components/card/card.tsx";
import { TextInput } from "../../components/text-input/text-input.tsx";
import { Select } from "../../components/select/select.tsx";
import { Dialog } from "../../components/dialog/dialog.tsx";
import { Grid, GridCell } from "../../components/grid/index.ts";

import { Divider } from "../../components/divider/divider.tsx";
import { TicketSidebar } from "../../components/ticket-sidebar/ticket-sidebar.tsx";
import { TicketPane } from "../../components/ticket-pane/ticket-pane.tsx";
// Layout tests now use renderLayoutWithProviders since Layout requires context providers

import type { Ticket } from "#types/ticket.ts";
import type { Accessor } from "solid-js";

// ─── Helpers ────────────────────────────────────────────────────

/** Wrap array as accessor for TicketSidebar */
function ticketsAccessor(arr: Ticket[]): Accessor<Ticket[]> {
  return () => arr;
}

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

// ─── Tiny viewport ──────────────────────────────────────────────

describe("Tiny viewport", () => {
  it("button in 5x1", async () => {
    const ctx = await renderWithProviders(
      () => <Button label="Submit Changes" variant="primary" />,
      { width: 5, height: 1 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("card in 8x3", async () => {
    const ctx = await renderWithProviders(
      () => (
        <Card title="This Title Is Way Too Long" width={8}>
          <text>Content that overflows</text>
        </Card>
      ),
      { width: 8, height: 3 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("text input in 10x3", async () => {
    const ctx = await renderWithProviders(
      () => (
        <TextInput
          inputId="tiny"
          value="Long value that won't fit"
          onChange={() => {}}
          label="A very long label"
          width={10}
        />
      ),
      { width: 10, height: 3 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("sidebar in 10x5", async () => {
    const ctx = await renderWithProviders(
      () => (
        <TicketSidebar
          tickets={ticketsAccessor([makeTicket("AM-1"), makeTicket("AM-2"), makeTicket("AM-3")])}
          selectedIndex={0}
          width={10}
          onSelect={() => {}}
          onNew={() => {}}
          onOpen={() => {}}
        />
      ),
      { width: 10, height: 5 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("layout in 20x5", async () => {
    const ctx = await renderLayoutWithProviders(() => <text>Main</text>, {
      width: 20,
      height: 5,
      rig: "github.com/org/repo",
    });
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("dialog larger than viewport", async () => {
    const ctx = await renderWithProviders(
      () => (
        <Dialog
          isOpen={true}
          onClose={() => {}}
          lockId="tiny-dialog"
          title="Big Dialog"
          width={50}
          height={20}
        >
          <text>This dialog is bigger than the terminal</text>
        </Dialog>
      ),
      { width: 20, height: 8 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });
});

// ─── Overflowing text ───────────────────────────────────────────

describe("Overflow text", () => {
  it("button with very long label", async () => {
    const ctx = await renderWithProviders(
      () => (
        <Button
          label="This is an extremely long button label that should overflow the container"
          variant="primary"
        />
      ),
      { width: 30, height: 3 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("card with long title and content", async () => {
    const ctx = await renderWithProviders(
      () => (
        <Card title="A Very Long Card Title That Exceeds The Width" width={25}>
          <text>
            This content is also very long and should wrap or truncate somehow in the limited space
          </text>
        </Card>
      ),
      { width: 30, height: 10 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("ticket pane with very long summary", async () => {
    const ctx = await renderWithProviders(
      () => (
        <TicketPane
          ticket={makeTicket("LONGTICKET-99999", {
            summary:
              "This is a very long ticket summary that describes a complex issue involving authentication timeouts when connecting to multiple microservices in parallel across different availability zones with varying network latencies",
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
      { width: 60, height: 20 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("sidebar with long ticket IDs", async () => {
    const ctx = await renderWithProviders(
      () => (
        <TicketSidebar
          tickets={ticketsAccessor([
            makeTicket("VERYLONGPROJECT-12345"),
            makeTicket("ANOTHERLONGONE-67890"),
          ])}
          selectedIndex={0}
          width={20}
          onSelect={() => {}}
          onNew={() => {}}
          onOpen={() => {}}
        />
      ),
      { width: 24, height: 12 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("select with long option labels", async () => {
    const ctx = await renderWithProviders(
      () => (
        <Select
          value="a"
          onChange={() => {}}
          options={[
            { value: "a", label: "An extremely verbose option label that goes on and on" },
            { value: "b", label: "Another ridiculously long option that nobody would use" },
          ]}
          label="Choose wisely"
        />
      ),
      { width: 25, height: 8 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });
});

// ─── Empty / missing data ───────────────────────────────────────

describe("Missing data", () => {
  it("ticket pane with null summary", async () => {
    const ctx = await renderWithProviders(
      () => (
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
      { width: 60, height: 20 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("ticket with empty string summary", async () => {
    const ctx = await renderWithProviders(
      () => (
        <TicketPane
          ticket={makeTicket("AM-001", { summary: "" })}
          events={[]}
          onEscalate={() => {}}
          onSwitchAgent={() => {}}
          onOpenJira={() => {}}
          onClose={() => {}}
          onSendMessage={() => {}}
        />
      ),
      { width: 60, height: 20 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("select with zero options", async () => {
    const ctx = await renderWithProviders(
      () => <Select value="" onChange={() => {}} options={[]} label="Nothing here" />,
      { width: 30, height: 6 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("button group with zero buttons", async () => {
    const ctx = await renderWithProviders(() => <ButtonGroup buttons={[]} />, {
      width: 30,
      height: 3,
    });
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("action bar with zero actions", async () => {
    const ctx = await renderWithProviders(() => <ActionBar actions={[]} />, {
      width: 30,
      height: 3,
    });
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("divider with zero length", async () => {
    const ctx = await renderWithProviders(() => <Divider length={0} />, { width: 30, height: 5 });
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("card with no children", async () => {
    const ctx = await renderWithProviders(
      () => (
        <Card title="Empty Card">
          <text></text>
        </Card>
      ),
      { width: 30, height: 8 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });
});

// ─── Extreme quantities ─────────────────────────────────────────

describe("Extreme quantities", () => {
  it("sidebar with 20 tickets", async () => {
    const ticketsArr = Array.from({ length: 20 }, (_, i) =>
      makeTicket(`TK-${i + 1}`, {
        status: (["pending", "queued", "implementing", "done", "blocked"] as const)[i % 5],
      }),
    );
    const ctx = await renderWithProviders(
      () => (
        <TicketSidebar
          tickets={ticketsAccessor(ticketsArr)}
          selectedIndex={10}
          width={28}
          onSelect={() => {}}
          onNew={() => {}}
          onOpen={() => {}}
        />
      ),
      { width: 32, height: 15 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("many buttons in a group", async () => {
    const buttons = Array.from({ length: 10 }, (_, i) => ({
      label: `B${i}`,
      shortcut: `${i}`,
    }));
    const ctx = await renderWithProviders(() => <ButtonGroup buttons={buttons} size="sm" />, {
      width: 60,
      height: 3,
    });
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("select with 15 options", async () => {
    const options = Array.from({ length: 15 }, (_, i) => ({
      value: `opt-${i}`,
      label: `Option ${i + 1}`,
    }));
    const ctx = await renderWithProviders(
      () => <Select value="opt-7" onChange={() => {}} options={options} label="Many" />,
      { width: 25, height: 10 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("grid 5x5 in tight space", async () => {
    const ctx = await renderWithProviders(
      () => (
        <Grid rows={5} cols={5}>
          <box flexDirection="column">
            <For each={Array.from({ length: 5 })}>
              {(_, r) => (
                <box flexDirection="row">
                  <For each={Array.from({ length: 5 })}>
                    {(_, c) => (
                      <GridCell id={`${r()}-${c()}`} row={r()} col={c()}>
                        <Button label={`${r()}${c()}`} size="sm" />
                      </GridCell>
                    )}
                  </For>
                </box>
              )}
            </For>
          </box>
        </Grid>
      ),
      { width: 30, height: 8 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });
});

// ─── Unicode / special characters ───────────────────────────────

describe("Special characters", () => {
  it("button with unicode label", async () => {
    const ctx = await renderWithProviders(
      () => (
        <box flexDirection="column" gap={1}>
          <Button label="日本語テスト" variant="primary" />
          <Button label="émojis 🎉🔥" variant="success" />
          <Button label="→ arrows ←" variant="warning" />
        </box>
      ),
      { width: 30, height: 6 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("card with unicode content", async () => {
    const ctx = await renderWithProviders(
      () => (
        <Card title="Ünïcödé" width={30}>
          <text>Ñoño café résumé naïve</text>
          <text>中文内容测试</text>
        </Card>
      ),
      { width: 35, height: 10 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("ticket with unicode summary", async () => {
    const ctx = await renderWithProviders(
      () => (
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
      { width: 60, height: 16 },
    );
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("divider with unicode label", async () => {
    const ctx = await renderWithProviders(() => <Divider label="★ SECTION ★" />, {
      width: 40,
      height: 5,
    });
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });
});
