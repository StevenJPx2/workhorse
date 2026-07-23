// `coding-nocode` — the A/B CONTROL for the Code Mode adoption eval. Identical
// to `coding` in every way EXCEPT run_code is stripped from every stage's tool
// allowlist. DERIVED from coding (not hand-copied) so the only variable between
// the two is run_code availability — the eval measures exactly that delta.

import { coding } from "./coding";
import type { WorkflowDef } from "../context";

export const codingNocode: WorkflowDef = {
  ...coding,
  name: "coding-nocode",
  description: "A/B control for Code Mode adoption: `coding` with run_code removed from every stage.",
  stages: coding.stages.map((s) => ({
    ...s,
    tools: (s.tools ?? []).filter((t) => (typeof t === "string" ? t : t.name) !== "run_code"),
  })),
  // run() is shared by reference — same routing, same loop-back. The agent
  // simply never sees run_code in the assembled tool set.
};
