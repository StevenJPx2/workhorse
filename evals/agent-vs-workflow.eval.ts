// Agent-behavior eval: raw single-stage agent (coding-raw) vs the staged
// plan→implement→verify pipeline (coding), on the SAME tasks. Answers "does
// the staged workflow's extra cost buy better work than one capable agent?"
//
// TWO-PHASE (a stage run is 10–20 min, so it can't live inside evalite's
// single pass — the same reason flue's own eval guide drives an already-
// deployed agent):
//   1. node evals/run.mjs file     — file raw+staged tickets for every task
//   2. (wait ~10–20 min)
//      node evals/run.mjs report    — collect diffs+metrics → evals/.results.json
//   3. bun run eval:ci              — THIS suite scores the recorded runs
//
// Scorers: `delivered` + `clean-run` are deterministic (keyless). The
// `diff-quality` LLM judge runs only when OPENAI_API_KEY is set (otherwise
// skipped, like the search-providers eval), so CI stays green offline.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LLMClassifierFromTemplate } from "autoevals";
import { evalite } from "evalite";

const here = dirname(fileURLToPath(import.meta.url));
const resultsPath = join(here, ".results.json");

interface RunResult {
  task: string;
  variant: string;
  ticketId: string;
  status: string;
  delivered: boolean;
  prUrl: string | null;
  tokens: number | null;
  loopbacks: number | null;
  failedStages: number | null;
  wallMs: number | null;
  diff: string;
  prompt: string;
}

const loaded: { results: RunResult[] } = existsSync(resultsPath)
  ? JSON.parse(readFileSync(resultsPath, "utf8"))
  : { results: [] };

// The LLM judge grades whether the recorded change actually satisfies the
// task. Keep the grader independent of the model under test. Gated on a key.
const judgeEnabled = !!process.env.OPENAI_API_KEY;
const diffJudge = LLMClassifierFromTemplate<{ prompt: string; diff: string }>({
  name: "diff-quality",
  promptTemplate: `You are grading an autonomous coding agent's work.

TASK GIVEN TO THE AGENT:
{{prompt}}

THE AGENT'S REPORTED CHANGE (final-stage analysis + diff stat):
{{diff}}

Does the change fully and correctly satisfy the task, with no missing
requirements and no obvious regressions? Answer with a single letter:
(A) Fully satisfies the task, correct and complete.
(B) Mostly satisfies it but with a minor gap or risk.
(C) Partially addresses it with significant gaps.
(D) Does not satisfy the task or is empty/broken.`,
  choiceScores: { A: 1, B: 0.66, C: 0.33, D: 0 },
  useCoT: true,
});

const variants = [...new Set(loaded.results.map((r) => r.variant))];

if (variants.length === 0) {
  // No recorded runs yet — register a placeholder so the file reports
  // instead of failing the runner (run `node evals/run.mjs file` first).
  evalite("agent-vs-workflow: no runs recorded", {
    data: async () => [{ input: "none", expected: "none" }],
    task: async () => "no evals/.results.json — run `node evals/run.mjs file`, wait, then `report`",
    scorers: [{ name: "skipped", description: "placeholder", scorer: () => 1 }],
  });
}

for (const variant of variants) {
  const rows = loaded.results.filter((r) => r.variant === variant);

  evalite(`agent-vs-workflow: ${variant}`, {
    data: async () => rows.map((r) => ({ input: r, expected: "delivered" })),
    task: async (r: RunResult) => JSON.stringify(r),
    scorers: [
      {
        name: "delivered",
        description: "Run reached a PR / terminal-success state",
        scorer: ({ output }) => ((JSON.parse(output) as RunResult).delivered ? 1 : 0),
      },
      {
        name: "clean-run",
        description: "No failed stages during the run",
        scorer: ({ output }) => {
          const r = JSON.parse(output) as RunResult;
          return (r.failedStages ?? 0) === 0 ? 1 : 0;
        },
      },
      ...(judgeEnabled
        ? [
            {
              name: "diff-quality",
              description: "LLM judge: does the change satisfy the task?",
              scorer: async ({ output }: { output: string }) => {
                const r = JSON.parse(output) as RunResult;
                if (!r.diff) return 0;
                const res = await diffJudge({ output: r.diff, prompt: r.prompt, diff: r.diff });
                return typeof res.score === "number" ? res.score : 0;
              },
            },
          ]
        : []),
    ],
  });
}
