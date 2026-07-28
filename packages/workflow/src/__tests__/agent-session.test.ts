// Compiling an agent into a stage session. Two things carry real risk: the write
// policy (readOnly must be stronger than an empty allowlist, not equivalent) and
// the control schema the model is shown.

import { agent, tool } from "@workhorse/api";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { agentEpilogue, agentSession } from "../agent-session";

const t = (name: string) =>
  tool({ name, description: `${name} tool`, docs: `${name} docs`, input: v.object({}), run: async () => "ok" });

const read = t("read");
const write = t("write");
const shot = t("browser_screenshot");

const OUT = (control: Record<string, v.GenericSchema> = {}) =>
  v.object({ control: v.object(control), analysis: v.string() });

describe("tool ceiling", () => {
  it("derives names from the agent's imported factories", () => {
    const a = agent({ name: "s", instructions: "x", output: OUT(), tools: [read, write] });

    expect(agentSession(a).tools).toContain("read");
    expect(agentSession(a).tools).toContain("write");
  });

  it("always appends submit_work", () => {
    const a = agent({ name: "s", instructions: "x", output: OUT(), tools: [read] });

    // Completion is submit_work's job, so a stage never needs general write
    // capability just to finish.
    expect(agentSession(a).tools).toContain("submit_work");
  });

  it("does not duplicate submit_work when the agent declares it", () => {
    const a = agent({ name: "s", instructions: "x", output: OUT(), tools: [t("submit_work")] });

    expect(agentSession(a).tools.filter((n) => n === "submit_work")).toHaveLength(1);
  });

  it("gives submit_work even to an agent with no tools", () => {
    const a = agent({ name: "s", instructions: "x", output: OUT() });

    expect(agentSession(a).tools).toEqual(["submit_work"]);
  });

  it("resolves a conditional surface against the invocation input", () => {
    const a = agent({
      name: "s",
      instructions: "x",
      output: OUT(),
      tools: ({ input }) => (input.uiChanges ? [read, shot] : [read]),
    });

    expect(agentSession(a, { uiChanges: false }).tools).not.toContain("browser_screenshot");
    expect(agentSession(a, { uiChanges: true }).tools).toContain("browser_screenshot");
  });

  it("returns the factories alongside the names", () => {
    const a = agent({ name: "s", instructions: "x", output: OUT(), tools: [read] });

    // The surface that instantiates tools needs the factories, not just names —
    // which is the whole reason agents import instances.
    expect(agentSession(a).factories).toEqual([read]);
  });
});

describe("write policy", () => {
  it("gives a readOnly agent a policy that matches nothing", () => {
    const a = agent({ name: "s", instructions: "x", output: OUT(), readOnly: true });
    const { writeAllow } = agentSession(a);

    // An EMPTY allowlist means "no policy set", which the gate treats as OPEN.
    // readOnly must therefore be a non-empty policy that cannot match a real path,
    // or a readOnly reviewer would silently have full write access.
    expect(writeAllow).not.toEqual([]);
    expect(writeAllow).toHaveLength(1);
  });

  it("passes a declared allowlist through", () => {
    const a = agent({ name: "s", instructions: "x", output: OUT(), writeAllow: ["src/**", "test/**"] });

    expect(agentSession(a).writeAllow).toEqual(["src/**", "test/**"]);
  });

  it("leaves an unrestricted agent's allowlist empty", () => {
    const a = agent({ name: "s", instructions: "x", output: OUT() });

    expect(agentSession(a).writeAllow).toEqual([]);
  });

  it("states a readOnly policy in the persona", () => {
    const a = agent({ name: "s", instructions: "Do the thing.", output: OUT(), readOnly: true });

    // Mechanically enforced AND stated: the gate stops the write, and the persona
    // stops the agent wasting a turn discovering that.
    expect(agentSession(a).persona).toContain("cannot modify the repository");
  });

  it("lists the allowed globs in the persona", () => {
    const a = agent({ name: "s", instructions: "Do it.", output: OUT(), writeAllow: ["src/**"] });

    expect(agentSession(a).persona).toContain("src/**");
  });

  it("leaves the persona alone when there is no policy", () => {
    const a = agent({ name: "s", instructions: "Just this.", output: OUT() });

    expect(agentSession(a).persona).toBe("Just this.");
  });
});

describe("control schema", () => {
  it("derives JSON Schema from the agent's control fields", () => {
    const a = agent({
      name: "s",
      instructions: "x",
      output: OUT({ verdict: v.picklist(["pass", "fail"]), count: v.number() }),
    });

    const schema = agentSession(a).controlSchema;
    expect(schema?.properties).toHaveProperty("verdict");
    expect(schema?.properties).toHaveProperty("count");
  });

  it("omits the schema when control has no fields", () => {
    // `{}` tells the model nothing; the epilogue's generic guidance is better.
    expect(agentSession(agent({ name: "s", instructions: "x", output: OUT() })).controlSchema).toBeUndefined();
  });

  it("survives a schema JSON Schema cannot express", () => {
    const a = agent({
      name: "s",
      instructions: "x",
      output: OUT({ weird: v.custom<string>(() => true) }),
    });

    // The valibot parse still enforces the real contract, so a conversion failure
    // must not fail the run.
    expect(() => agentSession(a)).not.toThrow();
  });
});

describe("epilogue", () => {
  const session = (control: Record<string, v.GenericSchema> = {}) =>
    agentSession(agent({ name: "s", instructions: "x", output: OUT(control) }));

  it("shows the derived schema when there is one", () => {
    const text = agentEpilogue(session({ verdict: v.picklist(["pass", "fail"]) }), "/dir");

    expect(text).toContain("MUST match this schema");
    expect(text).toContain("verdict");
  });

  it("falls back to generic guidance with no control fields", () => {
    const text = agentEpilogue(session(), "/dir");

    expect(text).toContain('{"status": "done"}');
    expect(text).not.toContain("MUST match this schema");
  });

  it("names the artifact directory", () => {
    expect(agentEpilogue(session(), "/workspace/.workflow/r1/stages/s/round-1")).toContain(
      "/workspace/.workflow/r1/stages/s/round-1",
    );
  });

  it("documents both escape hatches", () => {
    const text = agentEpilogue(session(), "/dir");

    expect(text).toContain("delegate");
    expect(text).toContain("inputRequest");
  });

  it("insists the run advances only on control.json", () => {
    // An agent claiming completion in prose is the failure this line exists for.
    expect(agentEpilogue(session(), "/dir")).toContain("Do not claim completion in prose");
  });
});
