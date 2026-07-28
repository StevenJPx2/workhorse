// todo_write — CREATE or UPDATE the run's work plan (write-capable).
//
// Separate from `todo` (read) because the stage allowlist gates by tool name:
// a read-only stage must be able to SEE the plan without being able to rewrite
// it. Marking a todo done is a signal the next coder visit reads, so a
// reviewer with write access could silently mislead the pipeline.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { readTodos, renderTodos, writeTodos, type Todo } from "./_store";

export default tool({
  name: "todo_write",
  description:
    "Create the run's todo list (create: the full ordered plan, replacing any existing one) or " +
    "record progress (update: set one todo's status, tick a subtask). Marking a todo done is the " +
    "signal the workflow uses to advance — only do it when the work is actually complete.",
  docs: `
todo_write — write the run's work plan. Read it with the \`todo\` tool.

ACTIONS

create — write the plan. REPLACES any existing list.
  todos  (required) ordered array of { title, subtasks?: string[] }
  Each todo must be an independent, verifiable unit of work: the workflow runs
  the coder ONCE PER TODO in order, so a todo may not depend on a later one.
  Ids are assigned automatically — t1, t2, … and subtasks t1.1, t1.2, …
  Subtasks are a checklist WITHIN a todo, not separate units of work.

update — change ONE todo.
  id           (required) e.g. "t2"
  status       pending | in_progress | done
  subtaskDone  a subtask id to tick, e.g. "t2.1"
  Set in_progress when you START a todo, done when it is finished AND verified.
  Both may be passed in one call. Returns the updated list.

EXAMPLES

  { action: "create", todos: [
      { title: "Add the auth middleware", subtasks: ["write it", "wire it up"] },
      { title: "Cover it with tests" }
  ]}
  { action: "update", id: "t1", status: "in_progress" }
  { action: "update", id: "t1", subtaskDone: "t1.1" }
  { action: "update", id: "t1", status: "done" }

NOTES
  done is a ROUTING signal, not a progress note — the workflow advances on it.
  To record partial progress, tick subtasks instead.
  An unknown todo or subtask id is reported back with the current list and
  NOTHING is written, so a bad id cannot half-apply a change.
`,
  input: v.object({
    action: v.picklist(["create", "update"]),
    /** The ordered plan, for create. */
    todos: v.optional(v.array(v.object({ title: v.string(), subtasks: v.optional(v.array(v.string())) }))),
    /** Target todo id, for update. */
    id: v.optional(v.string()),
    /** New status, for update. */
    status: v.optional(v.picklist(["pending", "in_progress", "done"])),
    /** Subtask id to tick, for update. */
    subtaskDone: v.optional(v.string()),
  }),
  async run({ input, sandbox }) {
    if (input.action === "create") {
      if (!input.todos?.length) return 'todo_write: action "create" needs at least one todo.';
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
    }

    if (!input.id) return 'todo_write: action "update" needs a todo id.';
    const doc = await readTodos(sandbox);
    const todo = doc.todos.find((t) => t.id === input.id);
    if (!todo) return `todo_write: no todo "${input.id}". Current list:\n${renderTodos(doc)}`;

    if (input.status) todo.status = input.status;
    if (input.subtaskDone) {
      const sub = todo.subtasks.find((s) => s.id === input.subtaskDone);
      // Return BEFORE writing so a bad subtask id can't half-apply the status.
      if (!sub) return `todo_write: no subtask "${input.subtaskDone}" on ${input.id}.`;
      sub.done = true;
    }

    await writeTodos(sandbox, doc);
    return `Updated ${input.id}:\n${renderTodos(doc)}`;
  },
});
