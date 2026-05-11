/**
 * Snapshot tests for composed views and theme consistency
 */

import { describe, it, expect } from "bun:test";
import { renderWithProviders, renderLayoutWithProviders } from "./test-helper.tsx";
import { TicketSidebar } from "../../components/ticket-sidebar/ticket-sidebar.tsx";
import { TicketPane } from "../../components/ticket-pane/ticket-pane.tsx";
import { makeTicket, ticketsAccessor, THEMES } from "./snapshot-utils.ts";

describe("TicketSidebar snapshots", () => {
  it("empty state", async () => {
    const ctx = await renderWithProviders(
      () => (
        <TicketSidebar
          tickets={ticketsAccessor([])}
          selectedIndex={0}
          width={28}
          onSelect={() => {}}
          onNew={() => {}}
          onOpen={() => {}}
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
          tickets={ticketsAccessor([
            makeTicket("AM-101", { status: "implementing" }),
            makeTicket("AM-102", { status: "done" }),
            makeTicket("AM-103", { status: "blocked" }),
          ])}
          selectedIndex={1}
          width={28}
          onSelect={() => {}}
          onNew={() => {}}
          onOpen={() => {}}
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
    const ctx = await renderLayoutWithProviders(() => <text>Main Content Here</text>, {
      width: 80,
      height: 24,
      rig: "github.com/acme/webapp",
    });
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("all-repos mode", async () => {
    const ctx = await renderLayoutWithProviders(() => <text>main</text>, {
      width: 80,
      height: 24,
      rig: "",
    });
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });
});

describe("Theme consistency", () => {
  for (const theme of THEMES) {
    it(`TicketSidebar in ${theme}`, async () => {
      const ctx = await renderWithProviders(
        () => (
          <TicketSidebar
            tickets={ticketsAccessor([makeTicket("TH-1"), makeTicket("TH-2", { status: "done" })])}
            selectedIndex={0}
            width={28}
            onSelect={() => {}}
            onNew={() => {}}
            onOpen={() => {}}
          />
        ),
        { width: 32, height: 16, theme },
      );
      expect(ctx.captureCharFrame()).toMatchSnapshot();
    });
  }
});
