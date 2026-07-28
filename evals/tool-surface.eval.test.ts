// Does CONSOLIDATION cost tool-choice accuracy?
//
// The consolidation argument was economic: fewer tool descriptions in every
// prompt. That says nothing about whether a model can DRIVE an action-picklist
// tool. This measures it, against the REAL tool definitions — descriptions and
// valibot schemas pulled straight from the plugins, so the test cannot drift
// from what ships.
//
// A cheap model is the harshest test: deepseek-v4-flash is the lowest-cost
// model in the opencode Go subscription, so passing here means anything passes.
//
// Off by default (needs a live model + several hundred calls). Run with:
//   bun run eval:tools
//
// The surfaces are named "granular" and "consolidated" to match the task
// expectations in @workhorse/test-utils/model.

import { describe, expect, it } from "vitest";
import {
  formatComparison,
  modelAvailable,
  modelClient,
  runToolChoiceEval,
  surfaceWeight,
  toolChoiceTasks,
  toolSurface,
  type ModelTool,
} from "@workhorse/test-utils/model";
import { aftTools } from "@workhorse/aft/tools";
import { browserTools } from "@workhorse/browser/tools";
import { granularTools } from "./fixtures/granular-tools/index";

const ENABLED = process.env.TOOL_SURFACE_EVAL === "1" && modelAvailable("go");
const MODEL = process.env.TOOL_SURFACE_MODEL ?? "deepseek-v4-flash";
const RUNS = Number(process.env.TOOL_SURFACE_RUNS ?? 3);

/**
 * The SHIPPING surface, from the real factories: browser (5 read actions) +
 * browser_interact (10 mutate actions) + aft (4 read actions) + aft_edit.
 */
const consolidated: ModelTool[] = toolSurface([...browserTools, ...aftTools]);

/**
 * The PRE-consolidation surface, from the pinned fixture — the 13 granular
 * tools exactly as they shipped, descriptions and schemas intact.
 *
 * An earlier version of this test SYNTHESIZED the granular surface by splitting
 * the consolidated descriptions. That was a strawman: the generated copy was
 * worse than the real thing had been, and the comparison flattered
 * consolidation. Both sides must be real code or the number is meaningless.
 */
const granular: ModelTool[] = toolSurface(granularTools);

const byName = (tools: ModelTool[], name: string) => tools.find((t) => t.function.name === name)!;

describe("tool surface", () => {
  it("derives the shipping surface from the real tool definitions", () => {
    const names = consolidated.map((t) => t.function.name).sort();
    expect(names).toEqual(["aft", "aft_edit", "browser", "browser_interact"]);

    // Real descriptions, not test copy.
    expect(byName(consolidated, "browser").function.description).toContain("persistent browser session");
    // The help flag is injected by tool(), so it must appear in the schema.
    const props = (byName(consolidated, "aft").function.parameters as { properties: Record<string, unknown> }).properties;
    expect(props).toHaveProperty("help");
    expect(props).toHaveProperty("action");
  });

  it("the consolidated surface is materially cheaper per turn", () => {
    const c = surfaceWeight(consolidated);
    const g = surfaceWeight(granular);

    expect(c.tools).toBeLessThan(g.tools);
    expect(c.tokens).toBeLessThan(g.tokens);
  });

  it.skipIf(!ENABLED)(
    "a cheap model picks the right tool on both surfaces",
    async () => {
      const client = modelClient({ provider: "go", model: MODEL });

      const results = await runToolChoiceEval({
        client,
        surfaces: { granular, consolidated },
        tasks: toolChoiceTasks,
        runs: RUNS,
        onProgress: (surface, task) =>
          process.stderr.write(`${surface.padEnd(13)} ${task.id.padEnd(18)} ${task.passes}/${task.runs}\n`),
      });

      console.log(formatComparison(results, client.model));

      const [g, c] = results;

      // THE ASSERTION THAT MATTERS: a surface may not be materially worse at
      // tool choice than the one it replaced. An absolute floor (">80%") is the
      // wrong gate — it passed a 12-point regression, which is how the first
      // version of this test let consolidation look acceptable.
      expect(
        c.rate,
        `consolidated (${c.rate.toFixed(1)}%) must not trail granular (${g.rate.toFixed(1)}%) by more than 3pp`,
      ).toBeGreaterThan(g.rate - 3);

      // An edit request must land on aft_edit, never on the read tool: if a
      // read tool absorbs write intent the stage allowlist stops being a
      // capability gate, which is a correctness failure, not a quality one.
      for (const r of results) {
        const boundary = r.tasks.find((t) => t.id === "edit-file")!;
        expect(boundary.passes, `${r.surface}: edit must route to the write tool`).toBe(boundary.runs);
      }
    },
    600_000,
  );
});
