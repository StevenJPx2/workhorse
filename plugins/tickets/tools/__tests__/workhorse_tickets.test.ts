// The five workhorse_* operator tools share one surface (fleet chat) and one
// dependency (Core), so they are tested together — each is thin enough that a
// file each would be more ceremony than coverage.

import { describe, expect, it } from "vitest";
import { fakeTicket, runTool } from "@workhorse/test-utils/tools";
import workhorse_file_ticket from "../workhorse_file_ticket";
import workhorse_find_workflow from "../workhorse_find_workflow";
import workhorse_list_tickets from "../workhorse_list_tickets";
import workhorse_ticket_diff from "../workhorse_ticket_diff";
import workhorse_ticket_status from "../workhorse_ticket_status";

describe("workhorse tools — surface gating", () => {
  it("are CHAT-only — a stage must not be able to file its own follow-up work", () => {
    // A stage that could file tickets could self-perpetuate, which breaks the
    // "the agent can never self-complete" property.
    for (const t of [
      workhorse_list_tickets,
      workhorse_ticket_status,
      workhorse_ticket_diff,
      workhorse_find_workflow,
      workhorse_file_ticket,
    ]) {
      expect(t.surfaces, t.toolName).toEqual(["chat"]);
    }
  });

  it("every tool documents itself without touching core", async () => {
    for (const t of [
      workhorse_list_tickets,
      workhorse_ticket_status,
      workhorse_ticket_diff,
      workhorse_find_workflow,
      workhorse_file_ticket,
    ]) {
      const { output, core } = await runTool(t, { help: true });
      expect(output.length, t.toolName).toBeGreaterThan(50);
      expect(core.calls, t.toolName).toHaveLength(0);
    }
  });
});

describe("workhorse_list_tickets", () => {
  const list = (tickets: ReturnType<typeof fakeTicket>[]) =>
    runTool(workhorse_list_tickets, {}, { core: { listTickets: async () => tickets } });

  it("renders id, status, title, and PR url", async () => {
    const { output } = await list([
      fakeTicket({ id: "t-1", status: "in_review", title: "Fix login", prUrl: "https://github.com/a/b/pull/1" }),
    ]);

    expect(output).toContain("t-1");
    expect(output).toContain("[in_review]");
    expect(output).toContain("Fix login");
    expect(output).toContain("pull/1");
  });

  it("omits the PR arrow for a ticket without one", async () => {
    const { output } = await list([fakeTicket({ id: "t-1", prUrl: undefined })]);

    expect(output).not.toContain("→");
  });

  it("caps the list at 25", async () => {
    const many = Array.from({ length: 40 }, (_, i) => fakeTicket({ id: `t-${i}` }));
    const { output } = await list(many);

    expect(output.split("\n")).toHaveLength(25);
  });

  it("says so plainly when the fleet is idle", async () => {
    const { output } = await list([]);
    expect(output).toBe("No tickets yet.");
  });
});

describe("workhorse_ticket_status", () => {
  const status = (ticket: ReturnType<typeof fakeTicket> | null) =>
    runTool(workhorse_ticket_status, { id: "t-1" }, { core: { getTicket: async () => ticket } });

  it("reports the core fields", async () => {
    const { output } = await status(fakeTicket({ id: "t-1", title: "Fix login", status: "running" }));

    expect(output).toContain("id: t-1");
    expect(output).toContain("title: Fix login");
    expect(output).toContain("status: running");
  });

  it("includes branch, PR, and error when present", async () => {
    const { output } = await status(
      fakeTicket({ branch: "fix/login", prUrl: "https://github.com/a/b/pull/1", error: "container died" }),
    );

    expect(output).toContain("branch: fix/login");
    expect(output).toContain("PR: https://github.com/a/b/pull/1");
    expect(output).toContain("error: container died");
  });

  it("omits absent optional lines rather than printing empty ones", async () => {
    const { output } = await status(fakeTicket({ branch: undefined, prUrl: undefined, error: undefined }));

    expect(output).not.toContain("branch:");
    expect(output).not.toContain("PR:");
    expect(output).not.toContain("error:");
  });

  it("truncates a long result", async () => {
    const { output } = await status(fakeTicket({ result: "r".repeat(5000) }));

    expect(output).toContain("r".repeat(2000));
    expect(output).not.toContain("r".repeat(2001));
  });

  it("reports a missing ticket by id", async () => {
    const { output } = await status(null);
    expect(output).toBe("No ticket t-1.");
  });

  it("forwards the requested id to core", async () => {
    const { core } = await runTool(
      workhorse_ticket_status,
      { id: "t-xyz" },
      { core: { getTicket: async () => null } },
    );

    expect(core.callsTo("getTicket")[0].args[0]).toBe("t-xyz");
  });
});

describe("workhorse_ticket_diff", () => {
  const diff = (patch: string | null) =>
    runTool(workhorse_ticket_diff, { id: "t-1" }, { core: { ticketDiff: async () => patch } });

  it("returns the patch", async () => {
    const { output } = await diff("diff --git a/x b/x\n+added");

    expect(output).toContain("diff --git");
    expect(output).toContain("+added");
  });

  it("truncates a huge patch at 20k", async () => {
    const { output } = await diff("d".repeat(50_000));

    expect(output).toHaveLength(20_000);
  });

  it("explains that no diff is persisted yet", async () => {
    const { output } = await diff(null);

    // A run that hasn't produced a diff is not an error — it's a phase.
    expect(output).toContain("No diff persisted");
  });
});

describe("workhorse_find_workflow", () => {
  const find = (hits: Array<{ name: string; stages?: string; description?: string }>) =>
    runTool(workhorse_find_workflow, { query: "screenshot a page" }, { core: { findWorkflows: async () => hits } });

  it("renders name, stages, and description per hit", async () => {
    const { output } = await find([{ name: "screenshot-pr", stages: "shoot", description: "Capture and open a PR" }]);

    expect(output).toContain("- screenshot-pr [shoot]: Capture and open a PR");
  });

  it("omits the stage bracket when absent", async () => {
    const { output } = await find([{ name: "coding", description: "The PR pipeline" }]);

    expect(output).toContain("- coding: The PR pipeline");
  });

  it("asks for at most 5 candidates", async () => {
    const { core } = await find([]);

    expect(core.callsTo("findWorkflows")[0].args[1]).toBe(5);
  });

  it("forwards the query verbatim", async () => {
    const { core } = await find([]);

    expect(core.callsTo("findWorkflows")[0].args[0]).toBe("screenshot a page");
  });

  it("recommends the coding default when nothing matches", async () => {
    const { output } = await find([]);

    // No match must not stall the operator — 'coding' is the safe general answer.
    expect(output).toContain("Default to 'coding'");
  });
});

describe("workhorse_file_ticket", () => {
  const file = (input: Record<string, unknown>, opts = {}) => runTool(workhorse_file_ticket, input, opts);

  it("forwards repo, prompt, title, and workflow", async () => {
    const { core } = await file({
      repo: "acme/widgets",
      prompt: "Fix the redirect",
      title: "Redirect fix",
      workflow: "coding",
    });

    expect(core.callsTo("fileTicket")[0].args[0]).toMatchObject({
      repo: "acme/widgets",
      prompt: "Fix the redirect",
      title: "Redirect fix",
      workflow: "coding",
    });
  });

  it("returns the new ticket id and points at how to track it", async () => {
    const { output } = await file(
      { repo: "acme/widgets", prompt: "x" },
      { core: { fileTicket: async () => ({ ok: true as const, ticket: fakeTicket({ id: "t-new", title: "X" }) }) } },
    );

    expect(output).toContain("t-new");
    expect(output).toContain("workhorse_ticket_status");
  });

  it("surfaces the rejection reason", async () => {
    const { output } = await file(
      { repo: "bad", prompt: "x" },
      { core: { fileTicket: async () => ({ ok: false as const, error: "repo not accessible" }) } },
    );

    expect(output).toContain("Could not file ticket");
    expect(output).toContain("repo not accessible");
  });

  it("does not claim success on rejection", async () => {
    const { output } = await file(
      { repo: "bad", prompt: "x" },
      { core: { fileTicket: async () => ({ ok: false as const, error: "nope" }) } },
    );

    expect(output).not.toContain("filed");
  });
});
