// todo_update — mutate ONE todo's status and/or tick a subtask. The Coder
// marks a todo in_progress when it starts and done when finished (which is the
// signal the workflow uses to advance to the next todo). One tool, targeted
// mutation — no redundant per-field setters.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { readTodos, renderTodos, writeTodos } from "./_store";

export default tool({
  name: "todo_update",
  description:
    "Update one todo: set its status (in_progress when you start it, done when it's finished and verified), " +
    "and/or mark a subtask done by its id (e.g. t2.1). Marking a todo done is the signal the workflow uses to " +
    "move to the next todo — only mark done when the work is actually complete. Returns the updated list.",
  docs: `
todo_update — record progress on ONE todo.

ARGUMENTS
  id           (required) e.g. "t2"
  status       pending | in_progress | done
  subtaskDone  a subtask id to tick, e.g. "t2.1"

Both status and subtaskDone may be passed in one call. Returns the updated list.

WHEN TO SET WHAT
  in_progress  when you START the todo
  done         when it is finished AND verified

MARKING done IS A ROUTING SIGNAL, NOT A PROGRESS NOTE
  The workflow advances on it. To record partial progress, tick subtasks
  instead — marking a todo done prematurely moves the pipeline on from
  incomplete work.

EXAMPLES

  { id: "t1", status: "in_progress" }
  { id: "t1", subtaskDone: "t1.1" }
  { id: "t1", status: "done" }

NOTES
  An unknown todo or subtask id is reported back with the current list and
  NOTHING is written, so a bad id cannot half-apply a change.
`,
  input: v.object({
    id: v.string(),
    status: v.optional(v.picklist(["pending", "in_progress", "done"])),
    subtaskDone: v.optional(v.string()),
  }),
  async run({ input, sandbox }) {
    const doc = await readTodos(sandbox);
    const todo = doc.todos.find((t) => t.id === input.id);
    if (!todo) return `todo_update: no todo "${input.id}". Current list:\n${renderTodos(doc)}`;
    if (input.status) todo.status = input.status;
    if (input.subtaskDone) {
      const sub = todo.subtasks.find((s) => s.id === input.subtaskDone);
      if (!sub) return `todo_update: no subtask "${input.subtaskDone}" on ${input.id}.`;
      sub.done = true;
    }
    await writeTodos(sandbox, doc);
    return `Updated ${input.id}:\n${renderTodos(doc)}`;
  },
});
