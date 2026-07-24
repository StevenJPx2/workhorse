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
  input: v.object({}),
  async run({ sandbox }) {
    const doc = await readTodos(sandbox);
    return renderTodos(doc);
  },
});
