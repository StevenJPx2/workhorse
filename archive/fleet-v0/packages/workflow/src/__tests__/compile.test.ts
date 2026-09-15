import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { agent } from "@workhorse/api";
import { agentEpilogue, agentSession } from "../agent-session";
import { assembleAgentPrompt, stageDir, upstreamDigest } from "../compile";

const review = agent({
  name: "review",
  instructions: "Review the change.",
  output: v.object({
    control: v.object({ verdict: v.picklist(["pass", "fail"]) }),
    analysis: v.string(),
  }),
});

describe("workflow prompt assembly", () => {
  it("builds stable stage directories", () => {
    expect(stageDir("run-1", "review", 2)).toBe("/workspace/.workflow/run-1/stages/review/round-2");
  });

  it("bounds upstream analysis", () => {
    expect(upstreamDigest("plan", "123456", { ok: true }, 3)).toContain("123");
    expect(upstreamDigest("plan", "123456", { ok: true }, 3)).toContain("truncated");
  });

  it("renders global and invocation inputs without repeating instructions", () => {
    const session = agentSession(review);
    const prompt = assembleAgentPrompt(review, session, "/workspace/.workflow/run-1/stages/review/round-1", {
      task: "review the patch",
      inputs: { mode: "strict" },
      input: { todoId: "todo-1" },
      upstream: [],
      round: 1,
    });

    expect(prompt).toContain("# Task\n\nreview the patch");
    expect(prompt).toContain("- mode: \"strict\"");
    expect(prompt).toContain("- todoId: \"todo-1\"");
    expect(prompt).toContain("submit_work");
    expect(prompt).not.toContain("Review the change.\n\n## Your stage");
  });

  it("renders steering and routed findings together", () => {
    const session = agentSession(review);
    const prompt = assembleAgentPrompt(review, session, "/tmp/review", {
      task: "review",
      upstream: [],
      steer: "Prioritize the crash.",
      routedFrom: { stage: "implement", digest: "missing null check" },
      round: 2,
    });

    expect(prompt).toContain("Operator steering");
    expect(prompt).toContain("Routed back from");
    expect(prompt).toContain("Stage round 2");
  });

  it("derives the completion contract from the same output schema", () => {
    const session = agentSession(review);

    expect(agentEpilogue(session, "/tmp/review")).toContain('"verdict"');
  });
});
