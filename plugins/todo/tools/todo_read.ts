// todo_read — read the run's current todo list + progress. The Coder calls it
// to see the full plan and which todo it's on; any stage can call it to orient.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { readTodos, renderTodos } from "./_store";

export default tool({
  name: "todo_read",
  description:
    "Read the run's todo list with current status ([ ] pending, [~] in progress, [x] done) and subtasks. " +
    "Use it to see the full plan and orient on the current unit of work.",
  docs: `
todo_read — read the run's shared work plan.

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

NOTES
  Read-only, so a read-only stage can see the plan without being able to change
  it. Use todo_write to create the list and todo_update to record progress.
`,
  input: v.object({}),
  async run({ sandbox }) {
    const doc = await readTodos(sandbox);
    return renderTodos(doc);
  },
});
