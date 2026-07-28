// todo — READ the run's work plan.
//
// Split from todo_write on the capability line. The stage allowlist gates by
// tool NAME only, so it cannot express "todo, but read-only" — the read half
// must be its own tool for a read-only stage (reviewer, PR writer) to see the
// plan without being able to rewrite it. A reviewer that could mark todos done
// would mislead the next coder visit, which reads this file.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { readTodos, renderTodos } from "./_store";

export default tool({
  name: "todo",
  description:
    "Read the run's work plan with current progress ([ ] pending, [~] in progress, [x] done) and " +
    "subtasks. Use it to see the full plan and orient on the current unit of work. To create or " +
    "update todos, use todo_write.",
  docs: `
todo — read the run's shared work plan.

The plan lives as JSON in the run workspace (/workspace/.workflow/todos.json),
OUTSIDE the repo, so it never pollutes the diff. Every stage in the run sees the
same list.

ARGUMENTS
  none.

OUTPUT
  One line per todo, subtasks indented beneath:

    [x] t1 Add the auth middleware
        [x] t1.1 write it
        [x] t1.2 wire it up
    [~] t2 Cover it with tests
    [ ] t3 Update the docs

  Markers: [ ] pending, [~] in progress, [x] done.
  Returns "(no todos yet)" when no plan has been written — including when the
  file is missing or corrupt, so this never fails a stage.

To create the list or record progress, use todo_write (a separate tool, so
read-only stages can see the plan without changing it).
`,
  input: v.object({}),
  async run({ sandbox }) {
    return renderTodos(await readTodos(sandbox));
  },
});
