// Shared todo store: a single per-run JSON file at /workspace/.workflow/todos.json
// (OUTSIDE the repo, so it never pollutes the diff; shared across every stage
// in the run's container). The TODO-creator writes it; the Coder reads + marks
// progress across the per-todo loop.

import type { SandboxHandle } from "@workhorse/api";

export const TODO_FILE = "/workspace/.workflow/todos.json";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}
export interface Todo {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "done";
  subtasks: Subtask[];
}
export interface TodoDoc {
  todos: Todo[];
}

export async function readTodos(sandbox: SandboxHandle): Promise<TodoDoc> {
  const raw = await sandbox.readFile(TODO_FILE);
  if (!raw) return { todos: [] };
  try {
    const doc = JSON.parse(raw) as TodoDoc;
    return { todos: Array.isArray(doc.todos) ? doc.todos : [] };
  } catch {
    return { todos: [] };
  }
}

export async function writeTodos(sandbox: SandboxHandle, doc: TodoDoc): Promise<void> {
  await sandbox.exec("mkdir -p /workspace/.workflow", { timeout: 10_000 });
  await sandbox.writeFile(TODO_FILE, JSON.stringify(doc, null, 2));
}

/** Compact human-readable rendering (for tool output). */
export function renderTodos(doc: TodoDoc): string {
  if (!doc.todos.length) return "(no todos yet)";
  return doc.todos
    .map((t) => {
      const mark = t.status === "done" ? "[x]" : t.status === "in_progress" ? "[~]" : "[ ]";
      const subs = t.subtasks.map((s) => `    ${s.done ? "[x]" : "[ ]"} ${s.id} ${s.title}`).join("\n");
      return `${mark} ${t.id} ${t.title}${subs ? "\n" + subs : ""}`;
    })
    .join("\n");
}
