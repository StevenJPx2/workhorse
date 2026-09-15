// Code Mode ADOPTION eval: does the agent actually reach for run_code on
// explore-heavy tasks, and does batching cost fewer tokens for equal delivery?
//
// A/B on the SAME tasks (evals/adoption.json): code-on (workflow `coding`,
// run_code available) vs code-off (`coding-nocode`, run_code stripped). Same
// two-phase flow as agent-vs-workflow, deploy-free via wrangler dev:
//   EVAL_CORPUS=adoption.json node evals/run.mjs file    (against localhost)
//   (wait) EVAL_CORPUS=adoption.json node evals/run.mjs report
//   bun run eval:ci                                       (this suite scores)
//
// HONEST FRAMING: adoption is a model+prompt property, not intrinsic. This
// measures whether our tool description + stage prompt make run_code worth
// reaching for on tasks that reward it. `used-run-code` is the direct signal;
// `delivered`/`clean-run` guard against adoption that doesn't ship (over-reach
// or misuse). The token delta between the two variants — printed by
// `run.mjs report` — is the value signal; this suite asserts adoption + parity.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evalite } from "evalite";

const here = dirname(fileURLToPath(import.meta.url));
const resultsPath = join(here, "adoption.results.json");

interface RunResult {
  task: string;
  variant: string;
  ticketId: string;
  status: string;
  delivered: boolean;
  tokens: number | null;
  runCodeCalls: number | null;
  failedStages: number | null;
}

const loaded: { results: RunResult[] } = existsSync(resultsPath)
  ? JSON.parse(readFileSync(resultsPath, "utf8"))
  : { results: [] };

const variants = [...new Set(loaded.results.map((r) => r.variant))];

if (variants.length === 0) {
  evalite("adoption: no runs recorded", {
    data: async () => [{ input: "none", expected: "none" }],
    task: async () => "no adoption.results.json — run `EVAL_CORPUS=adoption.json node evals/run.mjs file`, wait, then `report`",
    scorers: [{ name: "skipped", description: "placeholder", scorer: () => 1 }],
  });
}

for (const variant of variants) {
  const rows = loaded.results.filter((r) => r.variant === variant);
  // Only the code-on variant is expected to adopt run_code; code-off is the
  // control (run_code isn't in its tool set, so used-run-code must be 0).
  const expectAdoption = variant === "code-on";

  evalite(`adoption: ${variant}`, {
    data: async () => rows.map((r) => ({ input: r, expected: expectAdoption ? "used" : "control" })),
    task: async (r: RunResult) => JSON.stringify(r),
    scorers: [
      {
        name: "delivered",
        description: "Run reached a PR / terminal-success state",
        scorer: ({ output }) => ((JSON.parse(output) as RunResult).delivered ? 1 : 0),
      },
      {
        name: "clean-run",
        description: "No failed stages",
        scorer: ({ output }) => ((JSON.parse(output) as RunResult).failedStages ?? 0) === 0 ? 1 : 0,
      },
      {
        name: expectAdoption ? "used-run-code" : "control-no-run-code",
        description: expectAdoption
          ? "Agent invoked run_code at least once (adoption)"
          : "Control: run_code unavailable, so never invoked (sanity)",
        scorer: ({ output }) => {
          const n = (JSON.parse(output) as RunResult).runCodeCalls ?? 0;
          return expectAdoption ? (n > 0 ? 1 : 0) : n === 0 ? 1 : 0;
        },
      },
    ],
  });
}
