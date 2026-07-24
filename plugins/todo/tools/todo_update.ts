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
