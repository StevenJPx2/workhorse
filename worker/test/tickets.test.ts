// Ticket intake. This is the single path by which work enters the fleet, and it
// had zero coverage — which is both why fallow scored it as risky and why the
// ordering bug below would have gone unnoticed.
//
// db and auth are mocked because this project runs on node (the real D1 tests
// live in @workhorse/db, inside workerd). What's under test here is the INTAKE
// LOGIC: validation, ref enrichment, repo normalization, and what gets handed to
// the workflow instance.

import { beforeEach, describe, expect, it, vi } from "vitest";

const putTicket = vi.fn();
const usable = vi.fn<() => Promise<string | null>>(async () => "sk-ant-oat01-fresh");
const recordRefUse = vi.fn();

vi.mock("../src/db", () => ({ db: () => ({ putTicket }) }));
vi.mock("../src/auth", () => ({ modelToken: () => ({ usable }) }));
vi.mock("../src/refs", () => ({
  parseRefs: (input: string) =>
    // Minimal stand-in for the plugin-driven parser: JIRA-style keys only, which
    // is enough to exercise the enrichment branch.
    [...input.matchAll(/\b([A-Z]+-\d+)\b/g)].map((m) => ({ kind: "jira", ref: m[1], label: "Jira" })),
  recordRefUse,
}));

const { fileTicket } = await import("../src/tickets");

const create = vi.fn();
const env = { TICKET_WF: { create }, TICKETS: {}, DB: {} } as never;

beforeEach(() => {
  vi.clearAllMocks();
  usable.mockResolvedValue("sk-ant-oat01-fresh");
});

describe("validation", () => {
  it("rejects a missing repo", async () => {
    const r = await fileTicket(env, { prompt: "do a thing" });
    expect(r).toEqual({ ok: false, error: "repo, prompt required", status: 400 });
  });

  it("rejects a missing prompt", async () => {
    const r = await fileTicket(env, { repo: "acme/widgets" });
    expect(r).toEqual({ ok: false, error: "repo, prompt required", status: 400 });
  });

  it("creates no workflow instance when validation fails", async () => {
    await fileTicket(env, { prompt: "x" });
    expect(create).not.toHaveBeenCalled();
    expect(putTicket).not.toHaveBeenCalled();
  });

  it("accepts a repo attachment in place of the repo field", async () => {
    const r = await fileTicket(env, {
      prompt: "fix it",
      attachments: [{ kind: "repo", ref: "acme/widgets" }],
    });

    expect(r.ok).toBe(true);
  });
});

describe("credential gate", () => {
  it("refuses with 503 when no usable token exists", async () => {
    usable.mockResolvedValue(null);
    const r = await fileTicket(env, { repo: "acme/widgets", prompt: "go" });

    expect(r).toMatchObject({ ok: false, status: 503 });
  });

  it("does NOT persist a ticket when the credential gate fails", async () => {
    usable.mockResolvedValue(null);
    await fileTicket(env, { repo: "acme/widgets", prompt: "go" });

    // The ordering that matters: a ticket written before the gate would sit in
    // the registry as `queued` with no workflow instance ever created —
    // permanently stuck and invisible to the heal sweep, which only looks at
    // `errored`.
    expect(putTicket).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("uses an explicitly supplied token without consulting the store", async () => {
    await fileTicket(env, { repo: "acme/widgets", prompt: "go", accessToken: "sk-ant-oat01-given" });

    expect(usable).not.toHaveBeenCalled();
    expect(create.mock.calls[0][0].params.accessToken).toBe("sk-ant-oat01-given");
  });
});

describe("repo normalization", () => {
  it("expands a bare owner/name slug to a clone URL", async () => {
    const r = await fileTicket(env, { repo: "acme/widgets", prompt: "go" });

    expect(r.ok && r.ticket.repo).toBe("https://github.com/acme/widgets.git");
  });

  it("leaves a full git URL untouched", async () => {
    const url = "https://github.com/acme/widgets.git";
    const r = await fileTicket(env, { repo: url, prompt: "go" });

    expect(r.ok && r.ticket.repo).toBe(url);
  });

  it("leaves a non-GitHub URL untouched", async () => {
    const url = "git@gitlab.com:acme/widgets.git";
    const r = await fileTicket(env, { repo: url, prompt: "go" });

    expect(r.ok && r.ticket.repo).toBe(url);
  });
});

describe("ref enrichment", () => {
  it("appends an Available context section for refs in the prompt", async () => {
    const r = await fileTicket(env, { repo: "acme/widgets", prompt: "fix PROJ-42 please" });

    expect(r.ok && r.ticket.prompt).toContain("## Available context");
    expect(r.ok && r.ticket.prompt).toContain("jira: PROJ-42");
  });

  it("records ref usage for frecency", async () => {
    await fileTicket(env, { repo: "acme/widgets", prompt: "fix PROJ-42" });

    expect(recordRefUse).toHaveBeenCalledTimes(1);
    expect(recordRefUse.mock.calls[0][1]).toEqual([{ kind: "jira", ref: "PROJ-42", label: "Jira" }]);
  });

  it("leaves the prompt alone when there are no refs", async () => {
    const r = await fileTicket(env, { repo: "acme/widgets", prompt: "just do it" });

    expect(r.ok && r.ticket.prompt).toBe("just do it");
    expect(recordRefUse).not.toHaveBeenCalled();
  });

  it("deduplicates a ref mentioned twice", async () => {
    await fileTicket(env, { repo: "acme/widgets", prompt: "PROJ-42 and again PROJ-42" });

    expect(recordRefUse.mock.calls[0][1]).toHaveLength(1);
  });

  it("excludes repo attachments from enrichable refs", async () => {
    // The repo is cloned, so offering fetch_context for it would be nonsense.
    const r = await fileTicket(env, {
      prompt: "go",
      attachments: [{ kind: "repo", ref: "acme/widgets" }],
    });

    expect(r.ok && r.ticket.prompt).not.toContain("## Available context");
  });

  it("merges non-repo attachments with prompt-parsed refs", async () => {
    await fileTicket(env, {
      repo: "acme/widgets",
      prompt: "see PROJ-42",
      attachments: [{ kind: "slack", ref: "C123/456" }],
    });

    const refs = recordRefUse.mock.calls[0][1] as Array<{ kind: string }>;
    expect(refs.map((r) => r.kind).sort()).toEqual(["jira", "slack"]);
  });
});

describe("the created record", () => {
  it("defaults the workflow to coding on BOTH record and params", async () => {
    const r = await fileTicket(env, { repo: "acme/widgets", prompt: "go" });

    // The spine reads params.workflow; defaulting only the record would leave it
    // undefined at the point that decides which pipeline runs.
    expect(r.ok && r.ticket.workflow).toBe("coding");
    expect(create.mock.calls[0][0].params.workflow).toBe("coding");
  });

  it("honours an explicit workflow", async () => {
    const r = await fileTicket(env, { repo: "acme/widgets", prompt: "go", workflow: "coding-raw" });
    expect(r.ok && r.ticket.workflow).toBe("coding-raw");
  });

  it("starts queued with wfInstance equal to the id", async () => {
    const r = await fileTicket(env, { repo: "acme/widgets", prompt: "go" });

    expect(r.ok && r.ticket.status).toBe("queued");
    expect(r.ok && r.ticket.wfInstance).toBe(r.ok ? r.ticket.id : null);
  });

  it("derives a title from the prompt when absent, capped at 60 chars", async () => {
    const r = await fileTicket(env, { repo: "acme/widgets", prompt: "x".repeat(200) });

    expect(r.ok && r.ticket.title).toHaveLength(60);
  });

  it("keeps an explicit title", async () => {
    const r = await fileTicket(env, { repo: "acme/widgets", prompt: "go", title: "Fix login" });
    expect(r.ok && r.ticket.title).toBe("Fix login");
  });

  it("uses the workflow-instance id matching the ticket id", async () => {
    const r = await fileTicket(env, { repo: "acme/widgets", prompt: "go" });
    expect(create.mock.calls[0][0].id).toBe(r.ok ? r.ticket.id : null);
  });

  it("strips selfOrigin from the params handed to the workflow", async () => {
    await fileTicket(env, { repo: "acme/widgets", prompt: "go", selfOrigin: "https://w.dev" });

    // selfOrigin is a request-scoped detail; persisting it into durable workflow
    // params would outlive its meaning.
    expect(create.mock.calls[0][0].params).not.toHaveProperty("selfOrigin");
  });

  it("persists the record before creating the instance", async () => {
    const order: string[] = [];
    putTicket.mockImplementation(async () => void order.push("put"));
    create.mockImplementation(async () => void order.push("create"));

    await fileTicket(env, { repo: "acme/widgets", prompt: "go" });

    // A workflow instance whose ticket does not exist yet would have the spine
    // reading a missing record on its first step.
    expect(order).toEqual(["put", "create"]);
  });
});
