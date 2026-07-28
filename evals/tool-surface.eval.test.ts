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
import { consolidatedTools } from "./fixtures/consolidated-tools/index";

const ENABLED = process.env.TOOL_SURFACE_EVAL === "1" && modelAvailable("go");
const MODEL = process.env.TOOL_SURFACE_MODEL ?? "deepseek-v4-flash";
const RUNS = Number(process.env.TOOL_SURFACE_RUNS ?? 3);

/**
 * The SHIPPING surface: 13 granular tools from the real factories, one per
 * operation. This is what won on accuracy.
 */
const granular: ModelTool[] = toolSurface([...browserTools, ...aftTools]);

/**
 * The REJECTED consolidated surface, from the pinned fixture — 4 tools with
 * action picklists, exactly as they shipped at c3b058a.
 *
 * Both sides must be REAL code. An earlier version of this test synthesized one
 * surface by splitting the other's descriptions, and reported the opposite
 * conclusion off that strawman.
 */
const consolidated: ModelTool[] = toolSurface(consolidatedTools);

const byName = (tools: ModelTool[], name: string) => tools.find((t) => t.function.name === name)!;

describe("tool surface", () => {
  it("derives the shipping surface from the real tool definitions", () => {
    const names = granular.map((t) => t.function.name).sort();
    expect(names).toEqual([
      // No aft_edit: AFT's protocol has no symbol-level edit, and an aft-side
      // write would bypass the writeAllow gate. Editing is the builtin
      // edit/write tools' job.
      "aft_inspect",
      "aft_outline",
      "aft_search",
      "aft_zoom",
      "browser_act",
      "browser_key",
      "browser_open",
      "browser_read",
      "browser_record",
      "browser_screenshot",
      "browser_scroll",
      "browser_snapshot",
    ]);

    // Real descriptions, not test copy.
    expect(byName(granular, "browser_open").function.description).toContain("persistent browser session");
    // The help flag is injected by tool(), so it must appear in every schema.
    for (const t of granular) {
      const props = (t.function.parameters as { properties?: Record<string, unknown> }).properties ?? {};
      expect(props, t.function.name).toHaveProperty("help");
    }
  });

  it("consolidation IS cheaper per turn — which is why it was tempting", () => {
    const c = surfaceWeight(consolidated);
    const g = surfaceWeight(granular);

    // Documents the actual trade: consolidation wins on tokens and loses on
    // accuracy. The saving was real; it just wasn't worth ~12pp.
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

      // THE ASSERTION THAT MATTERS: the SHIPPING surface must not be materially
      // worse at tool choice than the alternative. An absolute floor (">80%") is
      // the wrong gate — it passed a 12-point regression, which is how the first
      // version of this test let consolidation look acceptable.
      expect(
        g.rate,
        `granular (${g.rate.toFixed(1)}%) must not trail consolidated (${c.rate.toFixed(1)}%) by more than 3pp`,
      ).toBeGreaterThan(c.rate - 3);

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
