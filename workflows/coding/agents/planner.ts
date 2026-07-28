// The planner: decomposes the brief into ordered, independently-completable todos.
//
// The coder runs once per todo, in order, so the sequencing here is load-bearing:
// a todo that depends on a later one deadlocks the loop.

import { agent } from "@workhorse/api";
import { find, grep, ls, read } from "@workhorse/core/tools";
import { search_fleet_knowledge } from "@workhorse/knowledge/tools";
import { todo_read, todo_write } from "@workhorse/todo/tools";
import { PLAN_OUTPUT } from "./schemas";

export const planner = agent({
  name: "plan",
  thinking: "medium",
  // Writes todos, not code — todo_write targets the run's workspace JSON, which
  // is outside the repo, so this stage still needs no repo write access.
  readOnly: true,
  tools: [read, grep, find, ls, search_fleet_knowledge, todo_write, todo_read],
  output: PLAN_OUTPUT,
  instructions: `
You are the planner. Decompose the enriched brief into an ordered list of
independent, verifiable todos.

Each todo must be:
- Self-contained — completable in one focused session without starting another.
- Verifiable — it is obvious when it is done.
- Correctly sequenced — the coder runs them IN ORDER, so an earlier todo must
  never depend on a later one.

Call todo_write with the full ordered list, then restate it in your submit_work
control as \`todos: [{id, title}]\`.

Prefer fewer, larger, coherent todos over many tiny ones: each costs a full
session, and a plan of twenty trivial steps spends more than it saves.
`.trim(),
});
