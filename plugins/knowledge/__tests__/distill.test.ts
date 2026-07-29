// Distilling a run into the document fleet knowledge indexes.
//
// Pure and exported, and it decides what a future agent can find: a field dropped
// here is invisible forever. Untested until now, which is why fallow scored it at
// 0% coverage.

import { describe, expect, it } from "vitest";
import { distillRun } from "../plugin";

const ticket = { title: "Fix login", repo: "acme/widgets", prompt: "the button does nothing" };
const activity = { status: "done", tasks: [{ id: "implement", status: "completed", analysis: "changed the handler" }] };

const doc = (over: { ticket?: object; activity?: object; escalations?: object[] } = {}) =>
  distillRun(
    "t1",
    "r1",
    "run",
    { ...ticket, ...over.ticket },
    { ...activity, ...over.activity } as never,
    over.escalations as never,
  );

describe("the header", () => {
  it("titles the document with the ticket title", () => {
    expect(doc().split("\n")[0]).toBe("# Fix login");
  });

  it("falls back to the ticket id when there is no title", () => {
    expect(doc({ ticket: { title: undefined } }).split("\n")[0]).toBe("# t1");
  });

  it("records ticket, run, repo, and status as searchable facts", () => {
    const out = doc();

    expect(out).toContain("- ticket: t1");
    expect(out).toContain("- run: r1 (run)");
    expect(out).toContain("- repo: acme/widgets");
    expect(out).toContain("- run status: done");
  });

  it("says unknown rather than undefined for a missing repo", () => {
    // "undefined" in an indexed document is a term a search can match on, which
    // is worse than a word that means what it says.
    const out = doc({ ticket: { repo: undefined } });

    expect(out).toContain("- repo: unknown");
    expect(out).not.toContain("undefined");
  });

  it("includes the PR url when there is one", () => {
    expect(doc({ ticket: { prUrl: "https://github.com/acme/widgets/pull/7" } })).toContain("/pull/7");
  });

  it("omits the PR line entirely when there is none", () => {
    expect(doc()).not.toContain("- pr:");
  });
});

describe("the task", () => {
  it("includes the original prompt", () => {
    expect(doc()).toContain("the button does nothing");
  });

  it("truncates a very long prompt", () => {
    const out = doc({ ticket: { prompt: "x".repeat(5000) } });
    expect(out.length).toBeLessThan(4000);
  });

  it("says unknown for an absent prompt", () => {
    expect(doc({ ticket: { prompt: undefined } })).toContain("(unknown)");
  });
});

describe("stages", () => {
  it("records each stage's analysis — the gold for a future search", () => {
    const out = doc({
      activity: {
        tasks: [
          { id: "enrich", status: "completed", analysis: "the real objective is X" },
          { id: "implement", status: "completed", analysis: "changed the handler" },
        ],
      },
    });

    expect(out).toContain("## Stage: enrich — completed");
    expect(out).toContain("the real objective is X");
    expect(out).toContain("changed the handler");
  });

  it("falls back to raw output when a stage has no analysis", () => {
    const out = doc({ activity: { tasks: [{ id: "x", status: "failed", output: "compile error at line 3" }] } });

    // A failed stage often has no analysis, and its output is exactly what a
    // future agent hitting the same error needs to find.
    expect(out).toContain("compile error at line 3");
    expect(out).toContain("```");
  });

  it("prefers analysis over output when both exist", () => {
    const out = doc({ activity: { tasks: [{ id: "x", status: "completed", analysis: "the summary", output: "raw" }] } });

    expect(out).toContain("the summary");
    expect(out).not.toContain("raw");
  });

  it("keeps the TAIL of a long output", () => {
    const out = doc({ activity: { tasks: [{ id: "x", status: "failed", output: `${"a".repeat(3000)}THE_ERROR` }] } });

    // A failing command's diagnosis is at its end.
    expect(out).toContain("THE_ERROR");
  });

  it("handles a run with no stages", () => {
    expect(() => doc({ activity: { tasks: [] } })).not.toThrow();
    expect(doc({ activity: { tasks: undefined } })).toContain("# Fix login");
  });
});

describe("escalations", () => {
  it("records a model swap with its trigger and destination", () => {
    const out = doc({
      escalations: [{ trigger: "promotion", detail: "budget spent", stage: "implement", toModel: "opus" }],
    });

    expect(out).toContain("## Escalations");
    expect(out).toContain("promotion on implement → opus: budget spent");
  });

  it("omits the stage and model when absent", () => {
    const out = doc({ escalations: [{ trigger: "fallback", detail: "429" }] });

    expect(out).toContain("- fallback: 429");
    expect(out).not.toContain("undefined");
  });

  it("omits the section entirely with no escalations", () => {
    expect(doc()).not.toContain("## Escalations");
    expect(doc({ escalations: [] })).not.toContain("## Escalations");
  });

  it("records several", () => {
    const out = doc({
      escalations: [
        { trigger: "fallback", detail: "429" },
        { trigger: "promotion", detail: "stalled" },
      ],
    });

    expect(out).toContain("429");
    expect(out).toContain("stalled");
  });
});
