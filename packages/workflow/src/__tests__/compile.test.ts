// Prompt assembly — what a stage session actually receives.
//
// The steer section existed here, fully written, while nothing supplied
// `parts.steer`: the engine could deliver operator steering and the worker never
// asked it to. These tests cover every section so a supplied part cannot silently
// go unrendered again.

import { describe, expect, it } from "vitest";
import { assemblePrompt } from "../compile";
import type { StageSpec } from "../types";

const stage = (over: Partial<StageSpec> = {}): StageSpec =>
  ({ id: "implement", prompt: "make the change", tools: [], ...over }) as StageSpec;

type Parts = Parameters<typeof assemblePrompt>[2];

const prompt = (parts: Partial<Parts> & Pick<Parts, "task">, spec = stage()) =>
  assemblePrompt(spec, "/workspace/.workflow/implement", { upstream: [], round: 1, ...parts });

describe("required sections", () => {
  it("leads with the task", () => {
    expect(prompt({ task: "fix the login button" })).toContain("# Task\n\nfix the login button");
  });

  it("includes the stage's own instructions, labelled with its id", () => {
    expect(prompt({ task: "t" })).toContain("## Your stage: implement");
    expect(prompt({ task: "t" })).toContain("make the change");
  });

  it("ends with the control contract", () => {
    // The stage cannot report a verdict it was never told how to express.
    expect(prompt({ task: "t" })).toContain("submit_work");
  });
});

describe("inputs", () => {
  it("renders declared inputs", () => {
    expect(prompt({ task: "t", inputs: { uiChanges: true } })).toContain("- uiChanges: true");
  });

  it("omits the section when there are none", () => {
    expect(prompt({ task: "t", inputs: {} })).not.toContain("## Inputs");
    expect(prompt({ task: "t" })).not.toContain("## Inputs");
  });
});

describe("upstream artifacts", () => {
  it("renders upstream digests", () => {
    expect(prompt({ task: "t", upstream: ["### plan\n\nthe plan"] })).toContain("## Upstream artifacts");
  });

  it("omits the section with no upstream", () => {
    expect(prompt({ task: "t", upstream: [] })).not.toContain("## Upstream artifacts");
  });
});

describe("operator steering", () => {
  it("renders a supplied steer", () => {
    const out = prompt({ task: "t", steer: "- use the other library" });

    expect(out).toContain("## Operator steering");
    expect(out).toContain("use the other library");
  });

  it("states that the operator OVERRIDES the task", () => {
    // Without this a stage weighs a human's correction equally against the
    // original prompt it contradicts.
    expect(prompt({ task: "t", steer: "- stop doing that" })).toContain("take precedence");
  });

  it("omits the section when nothing was steered", () => {
    expect(prompt({ task: "t" })).not.toContain("## Operator steering");
  });

  it("renders steering ALONGSIDE routed-back findings", () => {
    const out = prompt({
      task: "t",
      steer: "- prioritise the crash",
      routedFrom: { stage: "review", digest: "blocking: missing null check" },
    });

    // Both can be true at once: a reviewer rejected the work AND an operator
    // redirected it. Dropping either loses an instruction.
    expect(out).toContain("## Operator steering");
    expect(out).toContain("Routed back from");
  });
});

describe("routed-back findings", () => {
  it("names the stage that rejected the work", () => {
    const out = prompt({ task: "t", routedFrom: { stage: "review", digest: "blocking: x" } });

    expect(out).toContain("review");
    expect(out).toContain("blocking: x");
  });

  it("says the same check runs again", () => {
    // A loop-back that reads as advice invites a partial fix.
    expect(prompt({ task: "t", routedFrom: { stage: "review", digest: "d" } })).toContain("runs again");
  });
});

describe("notifications", () => {
  it("renders a supplied notification block verbatim", () => {
    expect(prompt({ task: "t", notifications: "## Operator input\n\n- do the thing" })).toContain("do the thing");
  });

  it("omits it when absent", () => {
    expect(prompt({ task: "t" })).not.toContain("## Operator input");
  });
});

describe("loop rounds", () => {
  const loop = stage({ type: "loop" });

  it("tells a loop stage which round it is on", () => {
    expect(prompt({ task: "t", round: 2, maxRounds: 3 }, loop)).toContain("Loop round 2 of at most 3");
  });

  it("omits the ceiling when unbounded", () => {
    const out = prompt({ task: "t", round: 2 }, loop);

    expect(out).toContain("Loop round 2");
    expect(out).not.toContain("at most");
  });

  it("includes the previous round's control so the stage can see its own last verdict", () => {
    expect(prompt({ task: "t", round: 2, previousControl: { status: "retry" } }, loop)).toContain("retry");
  });

  it("says nothing about rounds for a non-loop stage", () => {
    expect(prompt({ task: "t", round: 1 })).not.toContain("Loop round");
  });
});

describe("section order", () => {
  it("puts the task first and the control contract last", () => {
    const out = prompt({
      task: "the task",
      inputs: { a: 1 },
      upstream: ["up"],
      steer: "- steered",
      routedFrom: { stage: "review", digest: "d" },
      notifications: "notified",
    });

    // Order is the contract: context accumulates, then the epilogue states how to
    // report. An epilogue buried mid-prompt gets skimmed.
    expect(out.indexOf("# Task")).toBe(0);
    expect(out.lastIndexOf("submit_work")).toBeGreaterThan(out.indexOf("## Operator steering"));
  });
});
