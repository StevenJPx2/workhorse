// todo_write — (re)create the run's todo list with optional subtasks. The
// TODO-creator stage calls this to decompose the enriched task into discrete
// units the Coder completes one at a time. Replaces the whole list (bulk set);
// per-item progress uses todo_update.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { renderTodos, writeTodos, type Todo } from "./_store";

export default tool({
  name: "todo_write",
  description:
    "Create the run's todo list: an ordered array of todos, each an independent, verifiable unit of work, " +
    "optionally broken into subtasks. Replaces any existing list. The workflow runs the Coder once per todo " +
    "(in order), so each todo should be self-contained and completable on its own. Subtasks are a checklist " +
    "the Coder ticks off within a todo. After calling this, report the same todos in your submit_work control " +
    "so the workflow can route them. Persisted to the run workspace (not the repo).",
  input: v.object({
    todos: v.array(
      v.object({
        title: v.string(),
        subtasks: v.optional(v.array(v.string())),
      }),
    ),
  }),
  async run({ input, sandbox }) {
    if (!input.todos.length) return "todo_write: provide at least one todo.";
    const todos: Todo[] = input.todos.map((t, i) => {
      const id = `t${i + 1}`;
      return {
        id,
        title: t.title,
        status: "pending",
        subtasks: (t.subtasks ?? []).map((s, j) => ({ id: `${id}.${j + 1}`, title: s, done: false })),
      };
    });
    await writeTodos(sandbox, { todos });
    return `Wrote ${todos.length} todo(s):\n${renderTodos({ todos })}`;
  },
});
