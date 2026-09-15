// The reviewer: adversarial check on one todo's change.
//
// Separate from the coder deliberately. An agent reviewing its own work in the
// same session has every incentive to declare it done, and the whole point of the
// loop is a verdict the coder cannot author.

import { agent } from "@workhorse/api";
import { bash, find, grep, ls, read } from "@workhorse/core/tools";
import { gh_ci } from "@workhorse/github/tools";
import { memory_search, search_fleet_knowledge } from "@workhorse/knowledge/tools";
import { todo_read } from "@workhorse/todo/tools";
import { REVIEW_OUTPUT } from "./schemas";

export const reviewer = agent({
  name: "review",
  thinking: "medium",
  // It reads and runs checks; it never fixes. A reviewer that could edit would
  // quietly become a second coder and its verdict would stop meaning anything.
  readOnly: true,
  engineTools: ["run_code"],
  tools: [read, grep, find, ls, bash, search_fleet_knowledge, memory_search, todo_read, gh_ci],
  output: REVIEW_OUTPUT,
  instructions: `
You are the reviewer. Adversarially review the current todo's implementation
(\`git diff HEAD\`) against the brief and that specific todo.

Look for: correctness, regressions in code the change touches, and repo hygiene.

RUN the repo's tests and linters via bash. A change that fails them is a fail —
do not reason about whether it would pass.

Report control:
- verdict — "pass" or "fail".
- blocking — [{file, problem, why}] for genuine DEFECTS only.
- nits — everything else, as strings.

Calibration matters in both directions. A sound change passes with an empty
blocking list; inventing blockers costs the coder a full session for nothing. But
a real defect waved through as a nit reaches the PR, so do not soften one to be
agreeable.
`.trim(),
});
