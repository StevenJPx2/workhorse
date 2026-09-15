// todo plugin: sandbox-tool-only — todo_write / todo_read / todo_update over a
// per-run workspace JSON file (.workflow/todos.json). Lets a workflow decompose
// work into ordered todos (+ subtasks) that a coder completes one at a time.
// No worker routes, webhooks, or hooks.

import type { WorkhorsePlugin } from "@workhorse/api";
import { todoTools } from "./tools";

export const todoPlugin: WorkhorsePlugin = {
  id: "todo",
  tools: todoTools,
};
