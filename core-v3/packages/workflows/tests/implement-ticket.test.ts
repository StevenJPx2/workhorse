import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  parseAgentMarkdown,
  parseArtifactGraphWorkflowSpec,
} from "@agwab/pi-workflow";
import { describe, expect, it } from "vite-plus/test";

const specUrl = new URL(
  "../workflows/implement-ticket/spec.json",
  import.meta.url,
);
const spec = JSON.parse(readFileSync(fileURLToPath(specUrl), "utf8"));

describe("implement-ticket bundle", () => {
  it("parses as a valid pi-workflow artifact-graph spec", () => {
    const parsed = parseArtifactGraphWorkflowSpec(spec);
    expect(parsed.name).toBe("implement-ticket");
    const stageIds = parsed.artifactGraph.stages.map((s) => s.id);
    expect(stageIds).toEqual(["plan", "implement", "prepare-pr"]);
  });

  it("keeps the plan stage read-only and the coder default write-capable", () => {
    expect(spec.defaults.worktreePolicy).toBe("off");
    const plan = spec.artifactGraph.stages.find(
      (s: { id: string }) => s.id === "plan",
    );
    expect(plan.readOnly).toBe(true);
    expect(plan.tools).not.toContain("write");
    expect(spec.defaults.tools).toContain("write");
    expect(spec.defaults.tools).not.toContain("bash");
  });

  it("loops implement until self-review reports complete", () => {
    const loop = spec.artifactGraph.stages.find(
      (s: { id: string }) => s.id === "implement",
    );
    expect(loop.type).toBe("loop");
    expect(loop.until).toEqual({
      stage: "self-review",
      path: "$.reviewStatus",
      equals: "complete",
    });
    expect(loop.stages.map((s: { id: string }) => s.id)).toEqual([
      "apply",
      "self-review",
    ]);
  });
});

describe("workhorse agents", () => {
  it("declares wh-planner as a read-only ceiling with no write/bash", () => {
    const md = readFileSync(
      fileURLToPath(new URL("../agents/wh-planner.md", import.meta.url)),
      "utf8",
    );
    const agent = parseAgentMarkdown(md, "wh-planner.md", "project");
    expect(agent.name).toBe("wh-planner");
    expect(agent.readOnly).toBe(true);
    expect(agent.tools).not.toContain("write");
    expect(agent.tools).not.toContain("bash");
  });

  it("declares wh-coder with a write ceiling that still excludes bash", () => {
    const md = readFileSync(
      fileURLToPath(new URL("../agents/wh-coder.md", import.meta.url)),
      "utf8",
    );
    const agent = parseAgentMarkdown(md, "wh-coder.md", "project");
    expect(agent.name).toBe("wh-coder");
    expect(agent.tools).toContain("write");
    expect(agent.tools).toContain("edit");
    expect(agent.tools).not.toContain("bash");
  });
});
